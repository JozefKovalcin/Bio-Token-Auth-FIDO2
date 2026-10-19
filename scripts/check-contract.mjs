import SwaggerParser from '@apidevtools/swagger-parser';
const api = await SwaggerParser.validate('packages/contracts/openapi.yaml');
if (!api.openapi?.startsWith('3.')) throw new Error('Expected an OpenAPI 3 contract');
console.log(`PASS: OpenAPI contract (${Object.keys(api.paths ?? {}).length} paths)`);
