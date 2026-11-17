export const healthController = {
  async check(): Promise<Response> {
    return Response.json({ status: "ok" });
  },
};
