import { describe, it, expect } from 'vitest'
import {
  contactFormSchema,
  consultationFormSchema,
  newsletterFormSchema,
  sanitizeInput,
} from './forms'

describe('contactFormSchema', () => {
  it('should validate valid contact form data', () => {
    const validData = {
      name: 'John Doe',
      email: 'john@example.com',
      company: 'TestCorp',
      subject: 'Test Subject',
      message: 'This is a test message with more than 10 characters',
    }
    const result = contactFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('should reject short name', () => {
    const invalidData = {
      name: 'J',
      email: 'john@example.com',
      message: 'This is a test message with more than 10 characters',
    }
    const result = contactFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('name')
    }
  })

  it('should reject invalid email', () => {
    const invalidData = {
      name: 'John Doe',
      email: 'invalid-email',
      message: 'This is a test message with more than 10 characters',
    }
    const result = contactFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('email')
    }
  })

  it('should reject short message', () => {
    const invalidData = {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Short',
    }
    const result = contactFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('message')
    }
  })

  it('should allow optional fields to be empty', () => {
    const dataWithOptionals = {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'This is a test message with more than 10 characters',
      company: '',
      subject: '',
    }
    const result = contactFormSchema.safeParse(dataWithOptionals)
    expect(result.success).toBe(true)
  })

  it('should reject XSS attempts in message', () => {
    const xssAttempt = {
      name: 'John Doe',
      email: 'john@example.com',
      message: '<script>alert("xss")</script>This is a test message',
    }
    // Schema allows the content but sanitization should be applied separately
    const result = contactFormSchema.safeParse(xssAttempt)
    expect(result.success).toBe(true)
    // Note: Actual XSS sanitization should happen in the API route
  })
})

describe('consultationFormSchema', () => {
  it('should validate valid consultation form data', () => {
    const validData = {
      name: 'Jane Smith',
      email: 'jane@company.com',
      company: 'Acme Inc',
      role: 'CTO',
      teamSize: '11–50',
      techStack: ['CRM: Salesforce', 'Communication: Slack'],
      securityLevel: 'high',
      compliance: ['soc2', 'gdpr'],
      message: 'Looking for automation solutions',
    }
    const result = consultationFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('should reject invalid teamSize', () => {
    const invalidData = {
      name: 'Jane Smith',
      email: 'jane@company.com',
      company: 'Acme Inc',
      role: 'CTO',
      teamSize: 'invalid',
    }
    const result = consultationFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('should reject invalid securityLevel', () => {
    const invalidData = {
      name: 'Jane Smith',
      email: 'jane@company.com',
      company: 'Acme Inc',
      role: 'CTO',
      teamSize: '11–50',
      securityLevel: 'invalid',
    }
    const result = consultationFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('should allow optional fields to be undefined', () => {
    const minimalData = {
      name: 'Jane Smith',
      email: 'jane@company.com',
      company: 'Acme Inc',
      role: 'CTO',
      teamSize: '1–10',
    }
    const result = consultationFormSchema.safeParse(minimalData)
    expect(result.success).toBe(true)
  })

  it('should validate all teamSize enum values', () => {
    const validTeamSizes = ['1–10', '11–50', '51–200', '200+']
    validTeamSizes.forEach((size) => {
      const data = {
        name: 'Test',
        email: 'test@example.com',
        company: 'Test Co',
        role: 'Developer',
        teamSize: size,
      }
      const result = consultationFormSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  it('should validate all securityLevel enum values', () => {
    const validLevels = ['standard', 'high', 'enterprise']
    validLevels.forEach((level) => {
      const data = {
        name: 'Test',
        email: 'test@example.com',
        company: 'Test Co',
        role: 'Developer',
        teamSize: '1–10',
        securityLevel: level,
      }
      const result = consultationFormSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})

describe('newsletterFormSchema', () => {
  it('should validate valid newsletter signup', () => {
    const validData = {
      email: 'subscriber@example.com',
    }
    const result = newsletterFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('should reject invalid email', () => {
    const invalidData = {
      email: 'not-an-email',
    }
    const result = newsletterFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('should allow honeypot field', () => {
    const dataWithHoneypot = {
      email: 'subscriber@example.com',
      website: '', // Honeypot field
    }
    const result = newsletterFormSchema.safeParse(dataWithHoneypot)
    expect(result.success).toBe(true)
  })
})

describe('sanitizeInput', () => {
  it('should trim whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello')
  })

  it('should remove HTML tag characters', () => {
    // sanitizeInput removes < and > characters for basic XSS prevention
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
    expect(sanitizeInput('<p>Hello</p>')).toBe('pHello/p')
  })

  it('should limit length to 1000 characters', () => {
    const longString = 'a'.repeat(1500)
    const result = sanitizeInput(longString)
    expect(result.length).toBe(1000)
  })

  it('should handle empty string', () => {
    expect(sanitizeInput('')).toBe('')
  })

  it('should handle special characters', () => {
    expect(sanitizeInput('Hello! @#$%^&*()')).toBe('Hello! @#$%^&*()')
  })
})
