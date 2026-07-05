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

Deno.serve(async (req) => {
  // Chỉ nhận request thật từ Telegram (kèm secret token)
  if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
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
