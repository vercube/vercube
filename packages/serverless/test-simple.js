// Simple test to verify basic functionality
import { convertEventToRequest } from './src/Adapters/aws-lambda/Utils/Request.js';
import { convertResponseToAWSResponse, convertBodyToAWSResponse } from './src/Adapters/aws-lambda/Utils/Response.js';

// Test Request conversion
console.log('Testing Request conversion...');
const v1Event = {
  httpMethod: 'GET',
  path: '/api/test',
  headers: { 'host': 'api.example.com' },
  body: null,
  isBase64Encoded: false,
  multiValueHeaders: {},
  multiValueQueryStringParameters: {},
  pathParameters: null,
  stageVariables: null,
  requestContext: {},
  resource: '',
  queryStringParameters: null
};

try {
  const request = convertEventToRequest(v1Event);
  console.log('✅ Request conversion successful');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
} catch (error) {
  console.log('❌ Request conversion failed:', error.message);
}

// Test Response conversion
console.log('\nTesting Response conversion...');
const response = new Response('{"message": "success"}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

try {
  const awsResponse = convertResponseToAWSResponse(response);
  console.log('✅ Response conversion successful');
  console.log('Headers:', awsResponse.headers);
} catch (error) {
  console.log('❌ Response conversion failed:', error.message);
}

// Test Body conversion
console.log('\nTesting Body conversion...');
try {
  const awsBody = await convertBodyToAWSResponse(response);
  console.log('✅ Body conversion successful');
  console.log('Body:', awsBody.body);
  console.log('IsBase64Encoded:', awsBody.isBase64Encoded);
} catch (error) {
  console.log('❌ Body conversion failed:', error.message);
}

console.log('\n✅ All basic tests completed!');
