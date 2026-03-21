import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { submitFormDirect, type FormSubmissionPayload } from './form-submission'

describe('submitFormDirect', () => {
  const mockFetch = vi.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = mockFetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const validPayload: FormSubmissionPayload = {
    formType: 'contact',
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Test message',
    },
    metadata: {
      url: 'https://zaplit.com/contact',
    },
  }

  it('should successfully submit form', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'test-123', success: true }),
    })

    const result = await submitFormDirect(validPayload)

    expect(result.success).toBe(true)
    expect(result.id).toBe('test-123')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/submit-form',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    )
  })

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Validation failed' }),
    })

    const result = await submitFormDirect(validPayload)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Validation failed')
  })

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await submitFormDirect(validPayload)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network error')
  })

  it('should handle unknown errors', async () => {
    mockFetch.mockRejectedValueOnce('Unknown error')

    const result = await submitFormDirect(validPayload)

    expect(result.success).toBe(false)
    expect(result.error).toBe('An unexpected error occurred')
  })

  it('should enrich payload with metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'test-456' }),
    })

    await submitFormDirect(validPayload)

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.metadata).toMatchObject({
      url: validPayload.metadata.url,
      userAgent: expect.any(String),
    })
  })

  it('should handle consultation form type', async () => {
    const consultationPayload: FormSubmissionPayload = {
      formType: 'consultation',
      data: {
        name: 'Jane Smith',
        email: 'jane@company.com',
        company: 'Acme Inc',
        role: 'CTO',
        teamSize: '11–50',
      },
      metadata: { url: 'https://zaplit.com' },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'consult-123' }),
    })

    const result = await submitFormDirect(consultationPayload)

    expect(result.success).toBe(true)
    expect(result.id).toBe('consult-123')
  })

  it('should handle newsletter form type', async () => {
    const newsletterPayload: FormSubmissionPayload = {
      formType: 'newsletter',
      data: { email: 'subscriber@example.com' },
      metadata: { url: 'https://zaplit.com/blog' },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'news-123' }),
    })

    const result = await submitFormDirect(newsletterPayload)

    expect(result.success).toBe(true)
    expect(result.id).toBe('news-123')
  })
})
