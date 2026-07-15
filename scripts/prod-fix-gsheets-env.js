/** Set Google Sheets env vars on production — delegates to Coolify DB sync (survives redeploys). */
process.argv[2] = "production";
require("./ensure-gsheets-coolify-env.js");
