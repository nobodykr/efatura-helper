export function accessHeaders(env, prefix = "FISCALIDADE_API") {
  const clientId = env && env[`${prefix}_CLIENT_ID`];
  const clientSecret = env && env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? {
    "cf-access-client-id": clientId,
    "cf-access-client-secret": clientSecret,
  } : {};
}
