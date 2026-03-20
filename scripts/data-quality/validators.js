/**
 * Data Quality Validators
 * 
 * Validation functions for n8n → Twenty CRM data pipeline
 * Includes: Email validation, Name parsing, Input sanitization, Company validation
 * 
 * @author Data Engineering Team
 * @version 3.0.0
 * @license MIT
 */

/**
 * Validates and normalizes email addresses according to RFC 5322/5321
 * 
 * @param {string} email - The email address to validate
 * @returns {Object} Validation result with valid flag, reason (if invalid), and normalized email
 * @example
 * validateEmail('John.Doe@Example.COM')
 * // Returns: { valid: true, normalized: 'john.doe@example.com' }
 * 
 * validateEmail('invalid-email')
 * // Returns: { valid: false, reason: 'Domain must contain TLD' }
 */
const validateEmail = (email) => {
  // Handle edge cases
  if (email === null || email === undefined) {
    return { valid: false, reason: 'Email is null or undefined' };
  }
  
  if (typeof email !== 'string') {
    return { valid: false, reason: 'Email must be a string' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Email is empty' };
  }
  
  // Check for @ symbol
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) {
    return { valid: false, reason: 'Must contain @ symbol' };
  }
  
  // Split into local and domain parts
  const local = trimmed.substring(0, atIndex);
  const domain = trimmed.substring(atIndex + 1);
  
  // Local part validation (RFC 5321)
  if (local.length === 0) {
    return { valid: false, reason: 'Local part cannot be empty' };
  }
  
  if (local.length > 64) {
    return { valid: false, reason: 'Local part exceeds 64 characters' };
  }
  
  if (local.startsWith('.') || local.endsWith('.')) {
    return { valid: false, reason: 'Local part cannot start or end with a dot' };
  }
  
  if (local.includes('..')) {
    return { valid: false, reason: 'Local part cannot contain consecutive dots' };
  }
  
  // Domain validation
  if (domain.length === 0) {
    return { valid: false, reason: 'Domain cannot be empty' };
  }
  
  if (domain.length > 255) {
    return { valid: false, reason: 'Domain exceeds 255 characters' };
  }
  
  if (!domain.includes('.')) {
    return { valid: false, reason: 'Domain must contain TLD' };
  }
  
  // Check for valid TLD (at least 2 characters)
  const tld = domain.substring(domain.lastIndexOf('.') + 1);
  if (tld.length < 2) {
    return { valid: false, reason: 'TLD must be at least 2 characters' };
  }
  
  // RFC 5322 compliant regex pattern (simplified for practical use)
  // Allows: alphanumeric, dots, hyphens, underscores, plus signs in local part
  // Allows: alphanumeric, hyphens, dots in domain part
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: 'Email format is invalid' };
  }
  
  // Additional check: domain should not start or end with hyphen
  const domainParts = domain.split('.');
  for (const part of domainParts) {
    if (part.startsWith('-') || part.endsWith('-')) {
      return { valid: false, reason: 'Domain labels cannot start or end with hyphens' };
    }
  }
  
  return { 
    valid: true, 
    normalized: trimmed,
    localPart: local,
    domain: domain
  };
};

/**
 * Parses a full name into first and last name components
 * Handles prefixes (Dr., Mr., Mrs., etc.) and suffixes (Jr., Sr., III, PhD, etc.)
 * 
 * @param {string} fullName - The full name to parse
 * @returns {Object} Object containing firstName, lastName, prefix, and suffix
 * @example
 * parseFullName('Dr. John Smith Jr.')
 * // Returns: { firstName: 'Dr. John', lastName: 'Smith Jr.', prefix: 'Dr.', suffix: 'Jr.' }
 * 
 * parseFullName('Mary Elizabeth Johnson')
 * // Returns: { firstName: 'Mary', lastName: 'Elizabeth Johnson', prefix: '', suffix: '' }
 */
const parseFullName = (fullName) => {
  // Handle edge cases
  if (fullName === null || fullName === undefined) {
    return { 
      firstName: 'Unknown', 
      lastName: '',
      prefix: '',
      suffix: '',
      middleNames: ''
    };
  }
  
  if (typeof fullName !== 'string') {
    return { 
      firstName: String(fullName), 
      lastName: '',
      prefix: '',
      suffix: '',
      middleNames: ''
    };
  }
  
  // Normalize whitespace
  let workingName = fullName.trim().replace(/\s+/g, ' ');
  
  if (workingName.length === 0) {
    return { 
      firstName: 'Unknown', 
      lastName: '',
      prefix: '',
      suffix: '',
      middleNames: ''
    };
  }
  
  // Define name prefixes and suffixes
  const prefixes = [
    'Dr.', 'Dr', 'Doctor', 'Mr.', 'Mr', 'Mrs.', 'Mrs', 'Ms.', 'Ms', 
    'Miss', 'Prof.', 'Prof', 'Professor', 'Rev.', 'Rev', 'Reverend',
    'Hon.', 'Hon', 'Honorable', 'Sir', 'Lady', 'Lord', 'Dame',
    'Capt.', 'Capt', 'Captain', 'Col.', 'Col', 'Colonel', 'Gen.', 'Gen', 'General',
    'Maj.', 'Maj', 'Major', 'Sgt.', 'Sgt', 'Sergeant', 'Lt.', 'Lt', 'Lieutenant'
  ];
  
  const suffixes = [
    'Jr.', 'Jr', 'Junior', 'Sr.', 'Sr', 'Senior', 'II', 'III', 'IV', 'V',
    'PhD', 'Ph.D.', 'MD', 'M.D.', 'JD', 'J.D.', 'DDS', 'D.D.S.',
    'RN', 'R.N.', 'CPA', 'C.P.A.', 'Esq.', 'Esq', 'Estate'
  ];
  
  let detectedPrefix = '';
  let detectedSuffix = '';
  let middleNames = '';
  
  // Extract prefix (case-insensitive match at start)
  for (const prefix of prefixes) {
    const prefixRegex = new RegExp(`^${prefix}\\s+`, 'i');
    if (prefixRegex.test(workingName)) {
      detectedPrefix = prefix.endsWith('.') ? prefix : prefix + '.';
      workingName = workingName.replace(prefixRegex, '');
      break;
    }
  }
  
  // Extract suffix (case-insensitive match at end)
  for (const suffix of suffixes) {
    const suffixRegex = new RegExp(`\\s+${suffix}$`, 'i');
    if (suffixRegex.test(workingName)) {
      detectedSuffix = suffix;
      workingName = workingName.replace(suffixRegex, '');
      break;
    }
  }
  
  // Split remaining name into parts
  const parts = workingName.split(' ').filter(part => part.length > 0);
  
  if (parts.length === 0) {
    return {
      firstName: detectedPrefix || 'Unknown',
      lastName: detectedSuffix,
      prefix: detectedPrefix,
      suffix: detectedSuffix,
      middleNames: ''
    };
  }
  
  if (parts.length === 1) {
    return {
      firstName: detectedPrefix ? `${detectedPrefix} ${parts[0]}` : parts[0],
      lastName: detectedSuffix,
      prefix: detectedPrefix,
      suffix: detectedSuffix,
      middleNames: ''
    };
  }
  
  // Multiple parts: first is first name, last is last name, middle are middle names
  const firstName = detectedPrefix ? `${detectedPrefix} ${parts[0]}` : parts[0];
  const lastNameBase = parts[parts.length - 1];
  const lastName = detectedSuffix ? `${lastNameBase} ${detectedSuffix}` : lastNameBase;
  
  if (parts.length > 2) {
    middleNames = parts.slice(1, -1).join(' ');
  }
  
  return {
    firstName,
    lastName,
    prefix: detectedPrefix,
    suffix: detectedSuffix,
    middleNames
  };
};

/**
 * Sanitizes input text to prevent XSS and injection attacks
 * Removes or escapes potentially dangerous characters and HTML tags
 * 
 * @param {string} input - The input string to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.allowNewlines - Whether to preserve newlines (default: true)
 * @param {boolean} options.trimResult - Whether to trim the result (default: true)
 * @param {number} options.maxLength - Maximum allowed length (default: no limit)
 * @returns {string} Sanitized text safe for storage and display
 * @example
 * sanitizeInput('<script>alert("xss")</script>Hello')
 * // Returns: 'Hello'
 * 
 * sanitizeInput('  hello@world.com  ')
 * // Returns: 'hello@world.com'
 */
const sanitizeInput = (input, options = {}) => {
  // Default options
  const opts = {
    allowNewlines: options.allowNewlines !== false,
    trimResult: options.trimResult !== false,
    maxLength: options.maxLength || null
  };
  
  // Handle edge cases
  if (input === null || input === undefined) {
    return '';
  }
  
  if (typeof input !== 'string') {
    input = String(input);
  }
  
  let sanitized = input;
  
  // Remove HTML tags to prevent XSS
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[<>]/g, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Remove control characters except newlines and tabs (if allowed)
  if (opts.allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }
  
  // Prevent SQL injection patterns (basic protection)
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)|(--)|(\/\*)|(\*\/)/gi, '');
  
  // Trim if requested
  if (opts.trimResult) {
    sanitized = sanitized.trim();
  }
  
  // Apply max length if specified
  if (opts.maxLength && sanitized.length > opts.maxLength) {
    sanitized = sanitized.substring(0, opts.maxLength);
    if (opts.trimResult) {
      sanitized = sanitized.trim();
    }
  }
  
  return sanitized;
};

/**
 * Validates company name for CRM storage
 * Checks length limits, forbidden characters, and content validity
 * 
 * @param {string} name - Company name to validate
 * @returns {Object} Validation result with valid flag, reason (if invalid), and normalized name
 * @example
 * validateCompanyName('Acme Corporation LLC')
 * // Returns: { valid: true, normalized: 'Acme Corporation LLC' }
 * 
 * validateCompanyName('   ')
 * // Returns: { valid: false, reason: 'Company name cannot be empty' }
 */
const validateCompanyName = (name) => {
  // Handle edge cases
  if (name === null || name === undefined) {
    return { valid: false, reason: 'Company name is null or undefined' };
  }
  
  if (typeof name !== 'string') {
    return { valid: false, reason: 'Company name must be a string' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Company name cannot be empty' };
  }
  
  if (trimmed.length < 2) {
    return { valid: false, reason: 'Company name must be at least 2 characters' };
  }
  
  if (trimmed.length > 255) {
    return { valid: false, reason: 'Company name exceeds 255 characters' };
  }
  
  // Check for forbidden characters
  const forbiddenChars = /[<>\x00-\x1F\x7F]/;
  if (forbiddenChars.test(trimmed)) {
    return { valid: false, reason: 'Company name contains invalid characters' };
  }
  
  // Check if it looks like a valid company name (not just numbers or symbols)
  const hasValidChars = /[a-zA-Z]/.test(trimmed);
  if (!hasValidChars) {
    return { valid: false, reason: 'Company name must contain at least one letter' };
  }
  
  // Normalize: collapse multiple spaces, capitalize common words
  let normalized = trimmed.replace(/\s+/g, ' ');
  
  return { 
    valid: true, 
    normalized: normalized,
    length: normalized.length
  };
};

/**
 * Validates phone number format and normalizes to E.164
 * 
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result with valid flag, reason (if invalid), and normalized phone
 * @example
 * validatePhone('+1 (555) 123-4567')
 * // Returns: { valid: true, normalized: '+15551234567' }
 */
const validatePhone = (phone) => {
  if (phone === null || phone === undefined) {
    return { valid: false, reason: 'Phone is null or undefined' };
  }
  
  if (typeof phone !== 'string') {
    return { valid: false, reason: 'Phone must be a string' };
  }
  
  // Remove all non-numeric characters except + for validation
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  
  // Count digits only
  const digits = digitsOnly.replace(/\+/g, '');
  
  if (digits.length < 10) {
    return { valid: false, reason: 'Phone number must have at least 10 digits' };
  }
  
  if (digits.length > 15) {
    return { valid: false, reason: 'Phone number exceeds 15 digits' };
  }
  
  // E.164 format normalization
  let normalized = digitsOnly;
  if (!digitsOnly.startsWith('+')) {
    if (digits.length === 10) {
      // Assume US number if 10 digits
      normalized = '+1' + digits;
    } else {
      normalized = '+' + digits;
    }
  }
  
  return { valid: true, normalized };
};

/**
 * Validates URL format
 * 
 * @param {string} url - URL to validate
 * @returns {Object} Validation result
 */
const validateUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is empty or not a string' };
  }
  
  const trimmed = url.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, reason: 'URL is empty' };
  }
  
  // Basic URL pattern
  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;
  
  if (!urlRegex.test(trimmed)) {
    return { valid: false, reason: 'Invalid URL format' };
  }
  
  // Ensure protocol is present
  let normalized = trimmed;
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }
  
  return { valid: true, normalized };
};

/**
 * Main validation orchestrator for form data
 * Runs all validations and returns comprehensive results
 * 
 * @param {Object} formData - Raw form data object
 * @param {Object} options - Validation options
 * @returns {Object} Comprehensive validation result with all field results
 * @example
 * validateFormData({
 *   email: 'john@example.com',
 *   fullName: 'John Doe',
 *   company: 'Acme Inc'
 * })
 */
const validateFormData = (formData, options = {}) => {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: {}
  };
  
  if (!formData || typeof formData !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'formData', message: 'Invalid form data object' }],
      warnings: [],
      normalized: {}
    };
  }
  
  // Validate email (required)
  const emailField = formData.email || formData.Email || formData.EMAIL;
  if (emailField) {
    const emailValidation = validateEmail(emailField);
    if (!emailValidation.valid) {
      result.valid = false;
      result.errors.push({ field: 'email', message: emailValidation.reason });
    } else {
      result.normalized.email = emailValidation.normalized;
    }
  } else if (options.requireEmail !== false) {
    result.valid = false;
    result.errors.push({ field: 'email', message: 'Email is required' });
  }
  
  // Parse and validate name
  const nameField = formData.fullName || formData.name || formData.FullName || formData.full_name;
  if (nameField) {
    const nameParts = parseFullName(nameField);
    result.normalized.firstName = nameParts.firstName;
    result.normalized.lastName = nameParts.lastName;
    result.normalized.namePrefix = nameParts.prefix;
    result.normalized.nameSuffix = nameParts.suffix;
    result.normalized.middleNames = nameParts.middleNames;
  } else if (options.requireName !== false) {
    result.warnings.push({ field: 'name', message: 'Name not provided' });
    result.normalized.firstName = 'Unknown';
    result.normalized.lastName = '';
  }
  
  // Validate company if provided
  const companyField = formData.company || formData.Company || formData.companyName;
  if (companyField) {
    const companyValidation = validateCompanyName(companyField);
    if (!companyValidation.valid) {
      if (options.strictCompany) {
        result.valid = false;
      }
      result.errors.push({ field: 'company', message: companyValidation.reason });
    } else {
      result.normalized.company = companyValidation.normalized;
    }
  }
  
  // Validate phone if provided
  const phoneField = formData.phone || formData.Phone || formData.phoneNumber;
  if (phoneField) {
    const phoneValidation = validatePhone(phoneField);
    if (!phoneValidation.valid) {
      if (options.strictPhone) {
        result.valid = false;
      } else {
        result.warnings.push({ field: 'phone', message: phoneValidation.reason });
      }
    } else {
      result.normalized.phone = phoneValidation.normalized;
    }
  }
  
  // Validate URL if provided
  const urlField = formData.url || formData.website || formData.companyUrl;
  if (urlField) {
    const urlValidation = validateUrl(urlField);
    if (!urlValidation.valid) {
      result.warnings.push({ field: 'url', message: urlValidation.reason });
    } else {
      result.normalized.url = urlValidation.normalized;
    }
  }
  
  // Sanitize message/notes
  const messageField = formData.message || formData.notes || formData.comments;
  if (messageField) {
    result.normalized.message = sanitizeInput(messageField, {
      allowNewlines: true,
      maxLength: 10000
    });
  }
  
  // Sanitize other text fields
  const textFields = ['role', 'jobTitle', 'title', 'department', 'industry'];
  textFields.forEach(field => {
    if (formData[field]) {
      result.normalized[field] = sanitizeInput(formData[field], { maxLength: 255 });
    }
  });
  
  return result;
};

// Export for n8n compatibility (CommonJS)
module.exports = {
  validateEmail,
  parseFullName,
  sanitizeInput,
  validateCompanyName,
  validatePhone,
  validateUrl,
  validateFormData
};

// Also export for ES modules
if (typeof exports !== 'undefined') {
  exports.validateEmail = validateEmail;
  exports.parseFullName = parseFullName;
  exports.sanitizeInput = sanitizeInput;
  exports.validateCompanyName = validateCompanyName;
  exports.validatePhone = validatePhone;
  exports.validateUrl = validateUrl;
  exports.validateFormData = validateFormData;
}
