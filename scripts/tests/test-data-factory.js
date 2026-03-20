#!/usr/bin/env node
/**
 * Test Data Factory for n8n-Twenty CRM Testing
 * Generates unique, identifiable test data
 */

class TestDataFactory {
  constructor(options = {}) {
    this.prefix = options.prefix || 'TEST';
    this.testId = `${this.prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.testStartTime = new Date();
  }

  /**
   * Generate a test person
   */
  generatePerson(overrides = {}) {
    return {
      name: overrides.name || `${this.testId}_John Smith`,
      email: overrides.email || `${this.testId.toLowerCase()}@test.example.com`,
      role: overrides.role || 'CTO',
      ...overrides
    };
  }

  /**
   * Generate a test company
   */
  generateCompany(overrides = {}) {
    return {
      name: overrides.name || `${this.testId}_Acme Corporation`,
      ...overrides
    };
  }

  /**
   * Generate a complete form submission
   */
  generateFullSubmission(overrides = {}) {
    const person = this.generatePerson(overrides.person);
    const company = this.generateCompany(overrides.company);
    
    return {
      data: {
        ...person,
        company: company.name,
        teamSize: overrides.teamSize || '11-50',
        techStack: overrides.techStack || ['CRM: Salesforce', 'Comm: Slack'],
        securityLevel: overrides.securityLevel || 'high',
        compliance: overrides.compliance || ['soc2', 'gdpr'],
        message: overrides.message || 'Integration test submission'
      },
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString(),
        testCase: overrides.testCase || 'standard'
      }
    };
  }

  /**
   * Generate minimal submission (required fields only)
   */
  generateMinimalSubmission(overrides = {}) {
    return {
      data: {
        name: overrides.name || `${this.testId}_Jane Doe`,
        email: overrides.email || `${this.testId.toLowerCase()}@test.example.com`,
        company: overrides.company || `${this.testId}_Test Corp`,
        role: overrides.role || 'CEO'
      },
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString(),
        testCase: 'minimal'
      }
    };
  }

  /**
   * Generate edge case test data
   */
  generateEdgeCase(type) {
    const edgeCases = {
      specialChars: {
        name: `${this.testId}_José O'Connor-Smith`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Café & Co.`,
        role: 'VP of Sales & Marketing',
        message: 'Test with special chars: ñ ü é ß'
      },
      unicode: {
        name: `${this.testId}_姓名测试`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_日本株式会社`,
        role: '主任',
        message: 'Unicode test: 你好世界 🎉 émojis'
      },
      longName: {
        name: `${this.testId}_Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Sr.`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Very Long Company Name Incorporated`,
        role: 'Senior Vice President of Engineering and Technology',
        message: 'Testing with very long name'
      },
      singleChar: {
        name: `${this.testId}_X`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_X Corp`,
        role: 'CEO',
        message: 'Single character name test'
      },
      xssAttempt: {
        name: `${this.testId}_<script>alert('xss')</script>`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Test Corp`,
        role: 'Developer',
        message: '<img src=x onerror=alert(1)>'
      },
      sqlInjection: {
        name: `${this.testId}_Robert'); DROP TABLE people; --`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Test Corp`,
        role: "' OR '1'='1",
        message: "'; DELETE FROM companies WHERE '1'='1"
      },
      longMessage: {
        name: `${this.testId}_John Smith`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Test Corp`,
        role: 'CTO',
        message: 'A'.repeat(5000) // 5000 character message
      }
    };

    return {
      data: edgeCases[type] || edgeCases.specialChars,
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString(),
        testCase: `edge-${type}`
      }
    };
  }

  /**
   * Generate validation error test cases
   */
  generateValidationError(type) {
    const validationErrors = {
      missingEmail: {
        name: `${this.testId}_No Email`,
        company: `${this.testId}_Test Corp`,
        role: 'CEO'
      },
      invalidEmail: {
        name: `${this.testId}_Bad Email`,
        email: 'not-an-email-address',
        company: `${this.testId}_Test Corp`,
        role: 'CEO'
      },
      missingName: {
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Test Corp`,
        role: 'CEO'
      },
      missingCompany: {
        name: `${this.testId}_No Company`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        role: 'CEO'
      },
      invalidTeamSize: {
        name: `${this.testId}_Invalid Enum`,
        email: `${this.testId.toLowerCase()}@test.example.com`,
        company: `${this.testId}_Test Corp`,
        role: 'CEO',
        teamSize: 'invalid-value'
      },
      blockedDomain: {
        name: `${this.testId}_Blocked Domain`,
        email: `${this.testId}@tempmail.com`,
        company: `${this.testId}_Test Corp`,
        role: 'CEO'
      }
    };

    return {
      data: validationErrors[type] || validationErrors.missingEmail,
      metadata: {
        testId: this.testId,
        timestamp: new Date().toISOString(),
        testCase: `validation-${type}`
      }
    };
  }

  /**
   * Get the test ID for cleanup purposes
   */
  getTestId() {
    return this.testId;
  }
}

// Export for use in other scripts
module.exports = TestDataFactory;

// CLI usage
if (require.main === module) {
  const factory = new TestDataFactory();
  
  console.log('=== Test Data Factory Output ===\n');
  
  console.log('1. Full Submission:');
  console.log(JSON.stringify(factory.generateFullSubmission(), null, 2));
  
  console.log('\n2. Minimal Submission:');
  console.log(JSON.stringify(factory.generateMinimalSubmission(), null, 2));
  
  console.log('\n3. Special Characters Edge Case:');
  console.log(JSON.stringify(factory.generateEdgeCase('specialChars'), null, 2));
  
  console.log('\n4. Validation Error (Missing Email):');
  console.log(JSON.stringify(factory.generateValidationError('missingEmail'), null, 2));
  
  console.log(`\nTest ID: ${factory.getTestId()}`);
}
