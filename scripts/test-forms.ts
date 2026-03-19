#!/usr/bin/env ts-node
/**
 * Form submission testing script
 * Replaces: local-dev/test-forms.sh, run-e2e-tests.sh
 */
import { execSync } from 'child_process';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || 'local-dev-secret';

interface FormTest {
  name: string;
  endpoint: string;
  data: object;
}

const tests: Record<string, FormTest> = {
  contact: {
    name: 'Contact Form',
    endpoint: '/api/submit-form',
    data: {
      formType: 'contact',
      data: {
        name: 'Test User',
        email: 'test@example.com',
        company: 'Test Corp',
        message: 'This is a test message from automated testing'
      },
      metadata: {
        url: `${BASE_URL}/contact`,
        source: 'test-script'
      }
    }
  },
  consultation: {
    name: 'Consultation Form',
    endpoint: '/api/submit-form',
    data: {
      formType: 'consultation',
      data: {
        name: 'Test User',
        email: 'test@example.com',
        company: 'Test Corp',
        role: 'CTO',
        teamSize: '10-50',
        techStack: ['React', 'Node.js', 'Python'],
        securityLevel: 'enterprise',
        compliance: ['SOC2', 'GDPR'],
        message: 'Looking for AI agent solutions for our team'
      },
      metadata: {
        url: `${BASE_URL}/#book-demo`,
        source: 'test-script'
      }
    }
  },
  newsletter: {
    name: 'Newsletter Form',
    endpoint: '/api/submit-form',
    data: {
      formType: 'newsletter',
      data: {
        email: 'test@example.com'
      },
      metadata: {
        url: `${BASE_URL}/blog`,
        source: 'test-script'
      }
    }
  }
};

const runTest = async (test: FormTest): Promise<boolean> => {
  console.log(`\n🧪 Testing ${test.name}...`);
  
  try {
    const curlCmd = [
      'curl -s -X POST',
      `-H "Content-Type: application/json"`,
      `-H "X-Webhook-Secret: ${WEBHOOK_SECRET}"`,
      `-d '${JSON.stringify(test.data)}'`,
      `${BASE_URL}${test.endpoint}`
    ].join(' ');
    
    const result = execSync(curlCmd, { encoding: 'utf8' });
    const response = JSON.parse(result);
    
    if (response.success || response.message) {
      console.log(`   ✅ ${test.name} passed`);
      return true;
    } else {
      console.log(`   ❌ ${test.name} failed:`, response);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ ${test.name} error:`, error instanceof Error ? error.message : error);
    return false;
  }
};

const runAllTests = async (): Promise<void> => {
  console.log(`🚀 Running form tests against ${BASE_URL}`);
  console.log('=' .repeat(50));
  
  const formType = process.argv[2];
  
  if (formType === 'all' || !formType) {
    let passed = 0;
    let failed = 0;
    
    for (const [key, test] of Object.entries(tests)) {
      const result = await runTest(test);
      if (result) passed++; else failed++;
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      process.exit(1);
    }
  } else if (tests[formType]) {
    const result = await runTest(tests[formType]);
    if (!result) {
      process.exit(1);
    }
  } else {
    console.error(`Unknown form type: ${formType}`);
    console.error(`Available: ${Object.keys(tests).join(', ')}`);
    process.exit(1);
  }
  
  console.log('\n✅ All tests completed successfully!');
};

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Form Testing Script');
  console.log('');
  console.log('Usage: ts-node scripts/test-forms.ts [form-type]');
  console.log('');
  console.log('Form types:');
  console.log('  contact       Test contact form');
  console.log('  consultation  Test consultation form');
  console.log('  newsletter    Test newsletter form');
  console.log('  all           Test all forms (default)');
  console.log('');
  console.log('Environment variables:');
  console.log('  TEST_URL              Base URL (default: http://localhost:3000)');
  console.log('  N8N_WEBHOOK_SECRET    Webhook secret (default: local-dev-secret)');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('❌ Tests failed:', err);
  process.exit(1);
});
