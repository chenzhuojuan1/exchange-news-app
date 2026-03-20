export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  // Support OPENAI_API_KEY as fallback for BUILT_IN_FORGE_API_KEY
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  // Google Gemini API Key (AIza...)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // SMTP email configuration
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: process.env.SMTP_PORT ?? "465",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  // Email recipients (comma-separated)
  emailTo: process.env.EMAIL_TO ?? "",
  // Site access password
  sitePassword: process.env.SITE_PASSWORD ?? "",
};
