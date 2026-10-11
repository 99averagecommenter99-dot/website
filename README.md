# Stepwise

A Waterloo contest-practice homepage with a private, server-side Gemini Flash tutor endpoint. Requires Node.js 20.6 or newer; there are no npm dependencies.

## Run locally

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to your private key. The default model is `gemini-3.8-flash`; change `GEMINI_MODEL` if you want another supported Flash model.
3. Start the site with `node --env-file=.env api.js`.
4. Open <http://127.0.0.1:4174>.

The server calls Google's Gemini `generateContent` API. See Google's [API key guide](https://ai.google.dev/gemini-api/docs/api-key), [model list](https://ai.google.dev/gemini-api/docs/models), and [generateContent reference](https://ai.google.dev/api/generate-content). Never put it in `index.html` or browser storage, and never commit `.env`. If the key is not configured, the tutor explains that AI responses are unavailable and disables question submission; it does not pretend that a local demo response came from AI.

## Deploy to Vercel

Vercel serves the page and contest PDFs as static files from `public/` and maps `/api/tutor` and `/api/tutor/status` to Node.js functions that forward to the existing HTTP handler. The tutor reads Gemini credentials only from server-side environment variables. See Vercel's [Node.js runtime guide](https://vercel.com/docs/functions/runtimes/node-js), [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration), and [CLI deployment guide](https://vercel.com/docs/cli/deploy).

1. Create or sign in to a Vercel account, then install the [Vercel CLI](https://vercel.com/docs/cli): `npm install --global vercel`.
2. From this project directory, run `vercel login`, then `vercel` and follow its setup prompts to create/link the project. The first deployment is a production deployment; later non-production deploys get preview URLs.
3. In Vercel Project Settings → Environment Variables, add `GEMINI_API_KEY` as a **server-side** variable for Production and Preview, and redeploy. Enable Vercel's system environment variables so the app can verify same-origin requests against the assigned deployment domains. Never put the Gemini key in browser code, source control, or a chat message; do not set `NEXT_PUBLIC_` or `VITE_` prefixes. Set it directly in the Vercel dashboard.
4. For subsequent production releases run `vercel --prod`; for a preview release run `vercel`.

The CLI command runs locally and requires Vercel account authentication. Connect the GitHub repository in Vercel to enable automatic preview deployments and production deployments from the main branch. The Vercel config exposes explicit `/api/tutor` and `/api/tutor/status` functions while leaving static assets directly servable. Vercel's free Hobby plan has personal/non-commercial limits; check the current [pricing and terms](https://vercel.com/pricing) for your intended use. Gemini API usage may cost extra. Review Google's [API key guide](https://ai.google.dev/gemini-api/docs/api-key), [model list](https://ai.google.dev/gemini-api/docs/models), and [student privacy/usage policy](https://ai.google.dev/gemini-api/docs/usage-policies) before using with students. Set Gemini usage limits.

After deployment, check that the homepage loads, `/api/tutor/status` returns `{"configured":true}`, all three PDF links open, a consented question with a matching contest/grade gets an answer, and a request with a foreign `Origin` receives 403.

## Test

Run the dependency-free API checks with:

```sh
node --test api.test.js
```

Tests replace the external AI call with a local fixture and do not need a real key or incur provider charges.
