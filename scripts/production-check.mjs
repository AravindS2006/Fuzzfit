import { validateProductionConfig } from './production-config.mjs';
const errors = validateProductionConfig(process.env);
if (errors.length) {
  console.error(
    'Production configuration needs attention:\n' + errors.map((error) => `- ${error}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    'Production configuration validated. Provider connectivity and sending-domain verification still require live checks.',
  );
}
