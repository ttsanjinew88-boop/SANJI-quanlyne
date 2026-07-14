// ============================================================
// Supabase Edge Function: tg-webhook
// Nhận callback khi bấm nút trong Telegram -> cộng điểm bất thường
// trực tiếp vào cloud (đúng nhân viên, đúng ngày, đúng tháng)
//
// CÁCH DEPLOY (làm 1 lần trong Supabase Dashboard):
// 1. Edge Functions -> Deploy a new function -> tên: tg-webhook
// 2. Dán toàn bộ file này -> Deploy
// 3. Tắt "Enforce JWT verification" của function này
//    (Edge Functions -> tg-webhook -> Details -> tắt Verify JWT)
// 4. Edge Functions -> Secrets -> thêm 2 secret:
//    TG_BOT_TOKEN = token bot Telegram
//    TG_SECRET    = chuỗi bí mật webhook (trùng với lúc setWebhook)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT = Deno.env.get("TG_BOT_TOKEN") ?? "";
const SECRET = Deno.env.get("TG_SECRET") ?? "";
const TG = `https://api.telegram.org/bot${BOT}`;
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const NAMES: Record<string, string> = {
  fkjade: "JADE", fkcarbon: "CARBON", fkmember: "MEMBER", fkangel: "ANGEL",
  fkgeon: "GEON", fkdante: "DANTE", fkpiu: "PIU", fkchamy: "CHAMY",
  fkluby: "LUBY", fkaimee: "AIMEE", fkantony: "ANTONY", fktrucia: "TRUCIA",
  fkminty: "MINTY", fkbrenna: "BRENNA", fkseren: "SEREN",
};

async function tg(method: string, body: unknown) {
  try {
    const r = await fetch(`${TG}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (_e) {
    return null;
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
};
const G1 = "-5266235608";      // nhóm 1: chỉ nhận text
const G2 = "-1002508451381";   // nhóm 2: nhận file + inline keyboard
const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

async function sendReport(req: Request): Promise<Response> {
  // Xác thực người gửi: phải là user đã đăng nhập (Authorization: Bearer <access_token>)
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response(JSON.stringify({ ok: false, description: "Chưa đăng nhập" }), { status: 401, headers: CORS });
  const { data: uinfo, error: uerr } = await anon.auth.getUser(jwt);
  if (uerr || !uinfo?.user) return new Response(JSON.stringify({ ok: false, description: "Phiên không hợp lệ" }), { status: 401, headers: CORS });
  // Kiểm tra quyền SỬA tab Báo cáo đại lý (bc)
  const { data: prof } = await sb.from("profiles").select("is_admin, perms, username").eq("user_id", uinfo.user.id).maybeSingle();
  const canBc = prof && (prof.is_admin || (prof.perms && prof.perms.bc === "edit"));
  if (!canBc) return new Response(JSON.stringify({ ok: false, description: "Không có quyền gửi báo cáo" }), { status: 403, headers: CORS });

  const form = await req.formData();
  const meta = JSON.parse(String(form.get("meta") || "{}"));
  const mode = meta.mode === "dai_ly" ? "dai_ly" : "cuoc";
  const fk = String(meta.fk || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!/^fk[a-z0-9]+$/.test(fk)) return new Response(JSON.stringify({ ok: false, description: "FK không hợp lệ" }), { status: 400, headers: CORS });
  const content = String(meta.content || "").slice(0, 900);
  const agent = String(meta.agent || "").slice(0, 120);

  // rid + điểm do SERVER quyết định — frontend KHÔNG thể giả mạo điểm cộng
  const rid = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0"), mm = String(now.getMonth() + 1).padStart(2, "0"), yy = now.getFullYear();
  const isoDate = `${yy}-${mm}-${dd}`;
  const dateStr = `${dd}/${mm}/${yy} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const cnt = mode === "dai_ly" ? 3 : 1;
  const cat = mode === "dai_ly" ? "m" : "a";
  const rm = mode === "dai_ly"
    ? { inline_keyboard: [[{ text: "✅ Xác Nhận", callback_data: `cf|${fk}|${isoDate}|m|3|${rid}` }, { text: "👁 Theo Dõi Thêm", callback_data: `wt|${fk}|${isoDate}|${rid}` }]] }
    : { inline_keyboard: [[{ text: "✅ Xác Nhận", callback_data: `cf|${fk}|${isoDate}|a|1|${rid}` }, { text: "❌ Hủy Bỏ", callback_data: `dm|${fk}|${isoDate}|${rid}` }]] };
  const fkName = (NAMES[fk] || fk.replace(/^fk/, "").toUpperCase());
  const head = mode === "dai_ly" ? "BÁO CÁO ĐẠI LÝ BẤT THƯỜNG" : "BÁO CÁO CƯỢC BẤT THƯỜNG";
  let txt = `${head}\nNgày: ${dateStr}\nKO: ${fkName}`;
  if (mode === "dai_ly") txt += `\nĐại Lý: ${agent || "-"}`;
  txt += `\nNote: ${content || "(không có nội dung)"}`;

  const files: File[] = [];
  for (const [k, v] of form.entries()) if (k.startsWith("file") && v instanceof File) files.push(v);

  try {
    // cược bất thường: gửi text vào nhóm 1
    if (mode === "cuoc") {
      await tg("sendMessage", { chat_id: G1, text: txt });
    }
    let lastMsgId: number | null = null;
    if (files.length) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isImg = (f.type || "").startsWith("image/");
        const fd = new FormData();
        fd.append("chat_id", G2);
        if (i === 0) fd.append("caption", txt + (files.length > 1 ? `\n(${files.length} file đính kèm)` : ""));
        fd.append(isImg ? "photo" : "document", f, f.name || `file_${i + 1}`);
        const r = await fetch(`${TG}/${isImg ? "sendPhoto" : "sendDocument"}`, { method: "POST", body: fd });
        const res = await r.json();
        if (!res.ok) throw new Error(res.description || "Lỗi gửi file");
        lastMsgId = res.result.message_id;
      }
    } else {
      const res = await tg("sendMessage", { chat_id: G2, text: txt, reply_markup: rm });
      if (!res?.ok) throw new Error(res?.description || "Lỗi gửi tin");
    }
    if (lastMsgId) {
      await tg("editMessageReplyMarkup", { chat_id: G2, message_id: lastMsgId, reply_markup: rm });
    }
    // ghi log gửi báo cáo
    await sb.from("audit_log").insert({
      user_id: uinfo.user.id, username: prof.username,
      action: mode === "dai_ly" ? "Gửi báo cáo đại lý bất thường" : "Gửi báo cáo cược bất thường",
      detail: `${fkName}` + (agent ? ` · ${agent}` : "") + ` · ${files.length} file`,
    });
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, description: String((e as any)?.message || e) }), { headers: CORS });
  }
}

// Reset 2FA của 1 tài khoản khác — chỉ ADMIN (hoặc Tổ Trưởng với Nhân viên)
async function handleAction(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: uinfo, error: uerr } = await anon.auth.getUser(jwt);
  if (uerr || !uinfo?.user) return new Response(JSON.stringify({ ok: false, description: "Phiên không hợp lệ" }), { status: 401, headers: CORS });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "reset_2fa") return new Response(JSON.stringify({ ok: false, description: "Hành động không hợp lệ" }), { status: 400, headers: CORS });

  const { data: caller } = await sb.from("profiles").select("is_admin, perms, username").eq("user_id", uinfo.user.id).maybeSingle();
  const callerRole = caller?.is_admin ? "admin" : (caller?.perms?._role === "totruong" ? "totruong" : "nhanvien");
  if (callerRole !== "admin" && callerRole !== "totruong")
    return new Response(JSON.stringify({ ok: false, description: "Không có quyền reset 2FA" }), { status: 403, headers: CORS });

  const targetId = String(body.target || "");
  const { data: target } = await sb.from("profiles").select("is_admin, perms, username").eq("user_id", targetId).maybeSingle();
  if (!target) return new Response(JSON.stringify({ ok: false, description: "Không tìm thấy tài khoản" }), { status: 404, headers: CORS });
  const targetRole = target.is_admin ? "admin" : (target.perms?._role === "totruong" ? "totruong" : "nhanvien");
  if (callerRole === "totruong" && targetRole !== "nhanvien")
    return new Response(JSON.stringify({ ok: false, description: "Tổ Trưởng chỉ reset được 2FA của Nhân viên" }), { status: 403, headers: CORS });

  try {
    const { data: fl } = await sb.auth.admin.mfa.listFactors({ userId: targetId });
    let n = 0;
    for (const f of (fl?.factors || [])) { await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: targetId }); n++; }
    await sb.from("audit_log").insert({ user_id: uinfo.user.id, username: caller?.username, action: "Reset 2FA", detail: (target.username || "").toUpperCase() + " · gỡ " + n + " thiết bị" });
    return new Response(JSON.stringify({ ok: true, removed: n }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, description: String((e as any)?.message || e) }), { headers: CORS });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // Frontend gửi báo cáo (có Authorization Bearer, không có secret của Telegram)
  const hasTgSecret = SECRET && req.headers.get("x-telegram-bot-api-secret-token") === SECRET;
  if (!hasTgSecret) {
    if (req.headers.get("authorization")) {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await handleAction(req);
      return await sendReport(req);
    }
    return new Response("forbidden", { status: 403 });
  }
  let update: any = null;
  try {
    update = await req.json();
  } catch (_e) {
    return new Response("ok");
  }
  const cq = update?.callback_query;
  if (!cq) return new Response("ok");

  const answer = (text: string, alert = true) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });

  try {
    // callback_data:
    //   cf|<fk>|<yyyy-mm-dd>|<m|a>|<điểm>|<rid>   -> Xác nhận (cộng điểm)
    //   wt|<fk>|<yyyy-mm-dd>|<rid>                -> Theo dõi thêm
    //   dm|<fk>|<yyyy-mm-dd>|<rid>                -> Hủy bỏ
    const parts = String(cq.data || "").split("|");
    const act = parts[0];
    if (act === "noop") {
      await answer("", false);
      return new Response("ok");
    }
    if (!["cf", "wt", "dm"].includes(act)) {
      await answer("Nút không hợp lệ");
      return new Response("ok");
    }

    // rid dùng 1 lần — chặn bấm lần 2 trên mọi thiết bị
    const rid = act === "cf" ? parts[5] : parts[3];
    const { data: ridRow } = await sb.from("reports").select("data")
      .eq("type", "rids").eq("month", "all").maybeSingle();
    const rids: string[] = ridRow?.data?.list ?? [];
    if (rid && rids.includes(rid)) {
      await answer("Báo cáo này đã được xử lý rồi, không thể thực hiện lần 2");
      return new Response("ok");
    }

    const who = cq.from?.first_name || cq.from?.username || "?";
    let doneLabel = "";

    if (act === "cf") {
      const fk = parts[1], date = parts[2];
      const cat = parts[3] === "m" ? "mkt" : "abuse";
      const cnt = Number(parts[4]) || 1;
      const mk = date.slice(0, 7);
      const day = String(Number(date.slice(-2)));
      const { data: anRow } = await sb.from("reports").select("data")
        .eq("type", "anomaly").eq("month", mk).maybeSingle();
      const an = (anRow?.data && anRow.data.abuse) ? anRow.data : { abuse: {}, mkt: {} };
      an[cat][fk] = an[cat][fk] || {};
      an[cat][fk][day] = (Number(an[cat][fk][day]) || 0) + cnt;
      await sb.from("reports").upsert(
        { type: "anomaly", month: mk, data: an, updated_at: new Date().toISOString() },
        { onConflict: "type,month" },
      );
      await sb.from("audit_log").insert({
        username: "telegram:" + who,
        action: "Xác nhận bất thường (Telegram)",
        detail: `${NAMES[fk] || fk} · +${cnt} · ngày ${date} · ${cat === "mkt" ? "Đại lý ngoài" : "Cược lạm dụng"}`,
      });
      await answer(`✅ Đã cộng +${cnt} điểm cho ${NAMES[fk] || fk} ngày ${date}`);
      doneLabel = `✅ Đã duyệt +${cnt} · ${NAMES[fk] || fk} · bởi ${who}`;
    } else if (act === "wt") {
      const fk = parts[1], date = parts[2];
      await sb.from("audit_log").insert({
        username: "telegram:" + who,
        action: "Theo dõi thêm (Telegram)",
        detail: `${NAMES[fk] || fk} · ngày ${date}`,
      });
      await answer(`👁 Đã ghi nhận Theo Dõi Thêm cho ${NAMES[fk] || fk}`);
      doneLabel = `👁 Theo dõi thêm · ${NAMES[fk] || fk} · bởi ${who}`;
    } else {
      const fk = parts[1], date = parts[2];
      await sb.from("audit_log").insert({
        username: "telegram:" + who,
        action: "Hủy báo cáo (Telegram)",
        detail: `${NAMES[fk] || fk} · ngày ${date}`,
      });
      await answer(`❌ Đã hủy bỏ báo cáo của ${NAMES[fk] || fk}`);
      doneLabel = `❌ Đã hủy · ${NAMES[fk] || fk} · bởi ${who}`;
    }

    if (rid) {
      rids.push(rid);
      await sb.from("reports").upsert(
        { type: "rids", month: "all", data: { list: rids }, updated_at: new Date().toISOString() },
        { onConflict: "type,month" },
      );
    }

    // Khóa nút trên tin nhắn -> hiện trạng thái đã xử lý, không bấm lại được
    const msg = cq.message;
    if (msg && doneLabel) {
      await tg("editMessageReplyMarkup", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [[{ text: doneLabel, callback_data: "noop" }]] },
      });
    }
  } catch (e) {
    await answer("Lỗi hệ thống: " + String((e as any)?.message || e));
  }
  return new Response("ok");
});
