import { SendPulseTransactionalEmailAdapter } from "../server/sendPulseAdapter";

const adapter = new SendPulseTransactionalEmailAdapter();
const sendTest = process.argv.includes("--send-test");

if (!adapter.isConfigured()) {
  console.error("SendPulse is not configured. Set SENDPULSE_API_KEY and SENDPULSE_API_FROM_EMAIL.");
  process.exit(1);
}

const auth = await adapter.verifyAuth();
console.log("SendPulse authentication verified.");
console.log(JSON.stringify({ result: (auth as { result?: unknown }).result ?? true }));

if (sendTest) {
  const recipient = process.env.SENDPULSE_TEST_RECIPIENT;
  if (!recipient) {
    console.error("Set SENDPULSE_TEST_RECIPIENT before using --send-test.");
    process.exit(1);
  }
  const result = await adapter.send({
    to: [{ email: recipient }],
    subject: "KwantuHub SendPulse integration test",
    html: "<p>KwantuHub SendPulse integration test.</p>",
    text: "KwantuHub SendPulse integration test.",
    idempotencyKey: `manual-sendpulse-test:${Date.now()}`,
  });
  console.log(`Test email accepted: ${result.providerMessageId}`);
}
