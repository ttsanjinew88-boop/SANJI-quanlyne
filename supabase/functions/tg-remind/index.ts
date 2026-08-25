// ============================================================
// Supabase Edge Function: tg-remind
// ĐỘNG CƠ NHẮC NHỞ TELEGRAM — thay cho trigger 1 phút của Google Apps Script.
//
// Hai đường vào:
//   1) pg_cron gọi mỗi phút, kèm header  x-cron-key: <TG_CRON_KEY>  -> chạy tick()
//   2) Dashboard gọi kèm JWT người dùng (ADMIN/Tổ Trưởng) -> action 'check' | 'test'
//
// CÁCH DEPLOY:
//   supabase functions deploy tg-remind --no-verify-jwt
//   (BẮT BUỘC --no-verify-jwt: pg_cron gọi không có JWT. Hàm tự kiểm tra
//    x-cron-key hoặc JWT bên dưới, nên KHÔNG hề mở toang.)
//
// SECRET cần có (Edge Functions -> Secrets):
//   TG_BOT_TOKEN  = token bot Telegram (dùng chung với super-function)
//   TG_CRON_KEY   = chuỗi bí mật tự đặt, phải trùng với chuỗi trong pg_cron job
//
// SQL đi kèm: supabase_remind_setup.sql (bảng tg_remind_sent / tg_remind_log + cron job)
//
// Múi giờ: TOÀN BỘ mốc giờ tính theo GMT+7. Deno Deploy chạy UTC nên KHÔNG dùng
// getHours() của máy chủ — cộng 7 giờ rồi đọc bằng getUTC* (cùng cách với super-function).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT = Deno.env.get("TG_BOT_TOKEN") ?? "";
const CRON_KEY = Deno.env.get("TG_CRON_KEY") ?? "";
const TG = `https://api.telegram.org/bot${BOT}`;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey, x-cron-key",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};
const TOL_MIN = 2; // dung sai khớp mốc giờ (phút) — cứu được khi 1 lượt cron bị rớt

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

// ---------- Telegram ----------
async function tgSend(chatId: string, topicId: string, text: string) {
  const payload: Record<string, unknown> = { chat_id: String(chatId), text: String(text) };
  if (topicId) payload.message_thread_id = Number(topicId);
  try {
    const r = await fetch(`${TG}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: "Lỗi kết nối: " + e };
  }
}

// ---------- Giờ GMT+7 ----------
function nowV7() {
  return new Date(Date.now() + 7 * 3600000); // đọc bằng getUTC* = giờ Việt Nam
}
function dayKeyOf(v: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.getUTCFullYear()}${p(v.getUTCMonth() + 1)}${p(v.getUTCDate())}`;
}

/**
 * Trả về danh sách "tag" mốc đang TỚI HẠN của 1 dòng nhắc (port nguyên logic Apps Script).
 * Chỉ gửi khi đã tới/qua mốc trong vòng TOL_MIN phút — không bao giờ gửi sớm.
 *  - hourly  : time = phút (0–59), lặp mỗi giờ            -> tag h<H>
 *  - interval: time = N giờ, gửi khi H % N === 0, phút :00 -> tag h<H>
 *  - daily/exact: time = "HH:mm", nhiều mốc cách nhau ","  -> tag t<HHmm>
 */
function dueSlots(rem: Record<string, string>, v: Date): string[] {
  const out: string[] = [];
  const tol = TOL_MIN * 60000;
  const Y = v.getUTCFullYear(), Mo = v.getUTCMonth(), D = v.getUTCDate(), H = v.getUTCHours();
  const due = (hh: number, mm: number) => {
    const d = v.getTime() - Date.UTC(Y, Mo, D, hh, mm, 0, 0);
    return d >= 0 && d <= tol;
  };

  if (rem.mode === "hourly") {
    let mm = parseInt(String(rem.time).replace(/[^0-9]/g, ""), 10);
    if (isNaN(mm) || mm < 0 || mm > 59) mm = 0;
    if (due(H, mm)) out.push("h" + H);
    return out;
  }
  if (rem.mode === "interval") {
    let n = parseInt(String(rem.time).replace(/[^0-9]/g, ""), 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 24) n = 24;
    if (H % n === 0 && due(H, 0)) out.push("h" + H);
    return out;
  }
  String(rem.time || "").split(",").forEach((piece) => {
    const s = piece.trim();
    if (!s || s.indexOf(":") === -1) return;
    const hp = s.split(":");
    const hh = parseInt(hp[0], 10), mn = parseInt(hp[1], 10);
    if (isNaN(hh) || isNaN(mn) || hh < 0 || hh > 23 || mn < 0 || mn > 59) return;
    if (due(hh, mn)) out.push("t" + String(hh).padStart(2, "0") + String(mn).padStart(2, "0"));
  });
  return out;
}

async function logRow(kind: string, who: string, detail: string, status: string) {
  try {
    await sb.from("tg_remind_log").insert({ kind, who, detail: detail.slice(0, 300), status: status.slice(0, 200) });
  } catch (_e) { /* lịch sử hỏng không được chặn việc gửi tin */ }
}

// ---------- ĐỘNG CƠ ----------
async function tick(): Promise<Response> {
  const v = nowV7();
  const dayKey = dayKeyOf(v);

  // dấu vết cho thanh trạng thái trên dashboard
  await sb.from("reports").upsert(
    { type: "tgremind_tick", month: "all", data: { at: Date.now() }, updated_at: new Date().toISOString() },
    { onConflict: "type,month" },
  );

  const { data: row } = await sb.from("reports").select("data").eq("type", "tgremind").eq("month", "all").maybeSingle();
  const groups = (row?.data?.groups ?? []) as Array<Record<string, any>>;
  if (!groups.length) return json({ ok: true, sent: 0 });

  let sent = 0, failed = 0;
  for (const g of groups) {
    if (g.enabled === false || !g.chatId) continue;
    for (const rem of (g.reminders ?? [])) {
      if (rem.enabled === false || !rem.content || !rem.mode) continue;
      for (const tag of dueSlots(rem, v)) {
        // CHỐNG GỬI TRÙNG: khóa chính (day_key, group_id, rem_id, tag).
        // Chèn TRƯỚC khi gửi -> hai lượt cron chồng nhau thì lượt sau bị chặn ngay.
        const ins = await sb.from("tg_remind_sent")
          .insert({ day_key: dayKey, group_id: String(g.id), rem_id: String(rem.id), tag });
        if (ins.error) continue; // trùng khóa = đã gửi rồi -> bỏ qua, KHÔNG gửi lại

        const r = await tgSend(String(g.chatId), String(g.topicId || ""), String(rem.content));
        if (r && r.ok) {
          sent++;
          await logRow("send", "HỆ THỐNG", `[${g.name || g.chatId}] ${String(rem.content).slice(0, 120)}`, "ok");
        } else {
          failed++;
          // Gửi hỏng -> XÓA dấu đã-gửi để lượt tick sau thử lại (còn trong dung sai 2 phút)
          await sb.from("tg_remind_sent").delete()
            .eq("day_key", dayKey).eq("group_id", String(g.id)).eq("rem_id", String(rem.id)).eq("tag", tag);
          await logRow("send", "HỆ THỐNG", `[${g.name || g.chatId}] ${String(rem.content).slice(0, 120)}`,
            "fail: " + ((r && r.description) || "không rõ"));
        }
        await new Promise((res) => setTimeout(res, 350)); // giãn nhịp, tránh giới hạn tốc độ Telegram
      }
    }
  }

  // Dọn rác 1 lần/ngày: bỏ dấu đã-gửi cũ hơn 2 ngày + cắt lịch sử còn 60 ngày
  if (v.getUTCHours() === 3 && v.getUTCMinutes() < 2) {
    const cut = new Date(Date.now() - 2 * 86400000);
    await sb.from("tg_remind_sent").delete().lt("day_key", dayKeyOf(new Date(cut.getTime() + 7 * 3600000)));
    await sb.from("tg_remind_log").delete().lt("at", new Date(Date.now() - 60 * 86400000).toISOString());
  }
  return json({ ok: true, sent, failed });
}

// ---------- Thao tác từ dashboard ----------
async function fromDashboard(req: Request, body: Record<string, any>): Promise<Response> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ ok: false, description: "Chưa đăng nhập" }, 401);
  const { data: uinfo, error: uerr } = await anon.auth.getUser(jwt);
  if (uerr || !uinfo?.user) return json({ ok: false, description: "Phiên không hợp lệ" }, 401);

  const { data: prof } = await sb.from("profiles").select("is_admin, perms, username").eq("user_id", uinfo.user.id).maybeSingle();
  const isTTup = !!prof && (prof.is_admin || (prof.perms && prof.perms._role === "totruong"));
  if (!isTTup) return json({ ok: false, description: "Chỉ ADMIN và Tổ Trưởng dùng được chức năng nhắc nhở" }, 403);

  const chatId = String(body.chatId || "").trim();
  const topicId = String(body.topicId || "").trim();
  if (!chatId) return json({ ok: false, description: "Thiếu ID nhóm Telegram" }, 400);

  if (body.action === "check") {
    const me = await (await fetch(`${TG}/getMe`)).json().catch(() => null);
    if (!me || !me.ok) return json({ ok: false, description: "Token bot của máy chủ không dùng được (secret TG_BOT_TOKEN)" }, 500);
    const r = await tgSend(chatId, topicId, `✅ Kết nối OK — bot "${me.result.username}" đã sẵn sàng nhắc nhở nhóm này.`);
    if (!r || !r.ok) {
      return json({ ok: false, description: "Bot OK nhưng gửi vào nhóm lỗi: " + ((r && r.description) || "") + " (bot đã được thêm vào nhóm chưa? ID nhóm đúng chưa?)" }, 400);
    }
    await logRow("cfg", prof!.username || "", "Kiểm tra kết nối nhóm " + chatId, "ok");
    return json({ ok: true, bot: me.result.username });
  }

  if (body.action === "test") {
    const text = String(body.text || "").trim();
    if (!text) return json({ ok: false, description: "Nội dung trống" }, 400);
    const r = await tgSend(chatId, topicId, text);
    if (!r || !r.ok) return json({ ok: false, description: (r && r.description) || "Gửi thất bại" }, 400);
    await logRow("cfg", prof!.username || "", "Gửi thử: " + text.slice(0, 120), "ok");
    return json({ ok: true });
  }

  return json({ ok: false, description: "Hành động không hợp lệ" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, description: "Chỉ nhận POST" }, 405);

  // Đường vào 1: pg_cron (không có JWT, chỉ có x-cron-key)
  const key = req.headers.get("x-cron-key") || "";
  if (key && CRON_KEY && key === CRON_KEY) {
    try {
      return await tick();
    } catch (e) {
      return json({ ok: false, description: "Lỗi động cơ: " + e }, 500);
    }
  }
  if (key) return json({ ok: false, description: "Sai khóa cron" }, 403);

  // Đường vào 2: dashboard
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_e) { /* body rỗng */ }
  try {
    return await fromDashboard(req, body);
  } catch (e) {
    return json({ ok: false, description: "Lỗi máy chủ: " + e }, 500);
  }
});
