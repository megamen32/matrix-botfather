const path = require('node:path');
const { PersonaStore } = require('../lib/personaStore');
const { LlmConfigStore } = require('../lib/llmConfigStore');
const { SecretVault } = require('../lib/secretVault');
const { ClubActivation } = require('../lib/clubActivation');
const { createAdminServer } = require('./server');

const personaDirectory = process.env.KLUB_PERSONA_DIR;
const configFile = process.env.KLUB_CONFIG_FILE;
const historyDirectory = process.env.KLUB_HISTORY_DIR || '/app/control-history';
const registryFile = process.env.BOTFATHER_REGISTRY_FILE;
const vaultFile = process.env.BOTFATHER_VAULT_FILE;
const serverName = process.env.MATRIX_SERVER_NAME;
const runtimeEnvFile = process.env.KLUB_RUNTIME_ENV_FILE;
if (!personaDirectory || !configFile || !runtimeEnvFile || !registryFile || !vaultFile || !serverName || !process.env.CONTROL_PLANE_MASTER_KEY || !process.env.CONTROL_PLANE_HTTP_USER || !process.env.CONTROL_PLANE_HTTP_PASSWORD) throw new Error('control plane environment is incomplete');
const registry = () => JSON.parse(require('node:fs').readFileSync(registryFile, 'utf8')).bots || {};
const vault = new SecretVault(vaultFile, process.env.CONTROL_PLANE_MASTER_KEY);
const personaStore = new PersonaStore(personaDirectory, path.join(historyDirectory, 'personas'));
const llmStore = new LlmConfigStore(configFile, path.join(historyDirectory, 'llm'));
const server = createAdminServer({
  personaStore,
  llmStore,
  clubActivation: new ClubActivation({
    personaStore,
    llmStore,
    runtimeEnvFile,
    managedBot: (username) => Boolean(registry()[`@${username}:${serverName}`]),
    tokenFor: (username) => vault.get(`@${username}:${serverName}`)?.token || null,
  }),
  botRegistry: () => Object.values(registry()).map(({ username, userId, displayName, createdAt }) => ({ username, userId, displayName, createdAt })),
  username: process.env.CONTROL_PLANE_HTTP_USER,
  password: process.env.CONTROL_PLANE_HTTP_PASSWORD,
});
server.listen(Number(process.env.CONTROL_PLANE_PORT || 8092), process.env.CONTROL_PLANE_BIND || '127.0.0.1', () => console.log('Klub control plane listening'));
