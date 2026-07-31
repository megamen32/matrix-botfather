#!/usr/bin/env node
const { migrateLegacySecrets } = require('../handlers/botStore');

console.log(`migrated_legacy_bot_records=${migrateLegacySecrets()}`);
