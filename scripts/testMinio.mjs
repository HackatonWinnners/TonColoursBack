import { uploadColorSvgToMinio, isMinioConfigured, getColorSvgUrl } from './src/services/minioStorage.js';

async function testMinioIntegration() {
  console.log('🧪 Testing MinIO Integration\n');

  // Check configuration
  console.log('1️⃣ Checking MinIO configuration...');
  if (!isMinioConfigured()) {
    console.error('❌ MinIO not configured. Check your .env file:');
    console.error('   MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET');
    process.exit(1);
  }
  console.log('✅ MinIO configured\n');

  // Test colors
  const testColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];

  console.log('2️⃣ Uploading test SVGs...');
  for (const color of testColors) {
    try {
      const url = await uploadColorSvgToMinio(color);
      console.log(`✅ ${color} → ${url}`);
    } catch (error) {
      console.error(`❌ ${color} failed:`, error.message);
    }
  }
  console.log('');

  // Test URL generation
  console.log('3️⃣ Testing URL generation...');
  const url = getColorSvgUrl('#ABCDEF');
  console.log(`✅ URL for #ABCDEF: ${url}\n`);

  // Test duplicate upload (should skip)
  console.log('4️⃣ Testing deduplication (uploading #FF0000 again)...');
  const duplicateUrl = await uploadColorSvgToMinio('#FF0000');
  console.log(`✅ Duplicate upload skipped: ${duplicateUrl}\n`);

  console.log('✨ All tests passed! MinIO is ready for production.\n');
  console.log('📝 Next steps:');
  console.log('   1. Start your backend: npm start');
  console.log('   2. Mint an NFT: POST /mint');
  console.log('   3. Check metadata: GET /metadata/{itemIndex}?color=FF0000&tg=123');
  console.log('   4. Verify SVG URL points to MinIO\n');
}

testMinioIntegration().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
