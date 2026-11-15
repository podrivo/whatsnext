export default async () => {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response("APP_URL or CRON_SECRET missing", { status: 500 });
  }

  const res = await fetch(`${base}/api/daily`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  return new Response(text, { status: res.status });
};

export const config = {
  schedule: "0 11 * * *",
};
