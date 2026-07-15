/** Trigger staging deploy via Praxarch API and print result. */
fetch("http://127.0.0.1:3901/cicd/deploy", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-praxarch-tenant": "bubblbook",
  },
  body: JSON.stringify({
    project: "bubblbook-bubblbook",
    environment: "staging",
    serviceId: "bubblbook",
  }),
})
  .then(async (r) => {
    const text = await r.text();
    console.log("status", r.status);
    console.log(text);
  })
  .catch((e) => console.error(e.message));
