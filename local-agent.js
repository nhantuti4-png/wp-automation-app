console.log("========= LOCAL AGENT TEST VERSION =========");
console.log("FILE:", __filename);
console.log("TIME:", new Date().toISOString());

const REGISTER_URL = "https://ais-pre-orgfns2iludm3cwyzqqycb-d704aaa311-as.a.run.app/api/local-agent/register";

(async () => {
  try {
    console.log("[TEST_REGISTER_START]");
    console.log("[TEST_REGISTER_URL]", REGISTER_URL);

    // Using native fetch if available (Node 18+)
    const response = await fetch(REGISTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        bridgeUrl: "https://ether-laxative-grader.ngrok-free.dev"
      })
    });

    console.log("[TEST_STATUS]", response.status);
    const text = await response.text();
    console.log("[TEST_RESPONSE]", text);

  } catch (err) {
    console.log("[TEST_FETCH_FAILED] Falling back to axios...");
    try {
      const res = await axios.post(REGISTER_URL, {
        bridgeUrl: "https://ether-laxative-grader.ngrok-free.dev"
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log("[AXIOS_STATUS]", res.status);
      console.log("[AXIOS_RESPONSE]", JSON.stringify(res.data));
    } catch (axErr) {
      console.error("[TEST_ERROR]", axErr.message);
      if (axErr.response) {
        console.log("[AXIOS_ERROR_BODY]", JSON.stringify(axErr.response.data));
      }
    }
  }
})();
