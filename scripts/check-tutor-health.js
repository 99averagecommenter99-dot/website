const siteUrl = new URL(process.env.STEPWISE_SITE_URL || 'https://website-seven-sandy-12.vercel.app');

if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash) {
  throw new Error('STEPWISE_SITE_URL must be a clean HTTPS origin.');
}

const origin = siteUrl.origin;

async function checkTutorHealth() {
  const statusResponse = await fetch(new URL('/api/tutor/status', origin), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!statusResponse.ok) {
    throw new Error(`Tutor status endpoint returned HTTP ${statusResponse.status}.`);
  }

  const status = await statusResponse.json();
  if (status.configured !== true) {
    throw new Error('Tutor is not configured with a server-side Gemini API key.');
  }

  const tutorResponse = await fetch(new URL('/api/tutor', origin), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({
      contest: 'Beaver Computing Challenge',
      grade: 9,
      question: 'Automated service-health probe: give one short hint for checking whether 91 is prime.',
      guardianConsent: true,
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!tutorResponse.ok) {
    throw new Error(`Tutor answer endpoint returned HTTP ${tutorResponse.status}.`);
  }

  const result = await tutorResponse.json();
  if (typeof result.answer !== 'string' || result.answer.trim().length < 20) {
    throw new Error('Tutor answer endpoint returned no usable answer.');
  }

  console.log(`Tutor health check passed for ${origin}; a synthetic answer was returned.`);
}

checkTutorHealth().catch((error) => {
  console.error(`Tutor health check failed: ${error.message}`);
  process.exitCode = 1;
});
