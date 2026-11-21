require("dotenv").config({ quiet: true });

async function main() {
  const { db, initDb } = require("../src/db");
  try {
    await initDb();
    console.log("Database schema ready");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("Database initialization failed (" + (error.code || error.name) + ")");
  process.exitCode = 1;
});
