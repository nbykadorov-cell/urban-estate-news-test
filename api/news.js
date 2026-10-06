export default function handler(request) {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Urban Estate News API works",
      time: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
