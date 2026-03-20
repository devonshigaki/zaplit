/**
 * Duplicate Detection Module
 * 
 * Detects duplicate records in Twenty CRM before creating new entries
 * Includes: Person duplicate check by email, Company duplicate check by name
 * Fuzzy matching for company names, Smart merge recommendations
 * 
 * @author Data Engineering Team
 * @version 3.0.0
 * @license MIT
 */

/**
 * Calculates Levenshtein distance between two strings
 * Used for fuzzy matching of company names
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance (0 = identical, higher = more different)
 * @private
 */
const levenshteinDistance = (str1, str2) => {
  if (str1 === null || str1 === undefined) str1 = '';
  if (str2 === null || str2 === undefined) str2 = '';
  
  str1 = String(str1).toLowerCase();
  str2 = String(str2).toLowerCase();
  
  const m = str1.length;
  const n = str2.length;
  
  // Handle empty strings
  if (m === 0) return n;
  if (n === 0) return m;
  
  // Create distance matrix
  const matrix = [];
  for (let i = 0; i <= m; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[m][n];
};

/**
 * Calculates similarity score between two strings (0-1 scale)
 * 1 = identical, 0 = completely different
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 * @example
 * calculateSimilarity('Acme Corporation', 'Acme Corp')
 * // Returns: ~0.8 (high similarity)
 */
const calculateSimilarity = (str1, str2) => {
  if (str1 === null || str1 === undefined) str1 = '';
  if (str2 === null || str2 === undefined) str2 = '';
  
  str1 = String(str1).trim();
  str2 = String(str2).trim();
  
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  
  return (maxLength - distance) / maxLength;
};

/**
 * Normalizes company name for comparison
 * Removes common suffixes, punctuation, and normalizes case
 * 
 * @param {string} name - Company name to normalize
 * @returns {string} Normalized company name
 * @example
 * normalizeCompanyName('Acme Corporation, Inc.')
 * // Returns: 'acme'
 */
const normalizeCompanyName = (name) => {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/\s*,?\s*(inc\.?|incorporated|corp\.?|corporation|llc|ltd\.?|limited|plc|gmbh|sa|bv|pty|ltd)\s*$/i, '')
    // Remove punctuation
    .replace(/[.,;:!?()[\]{}]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Calculates fuzzy match score for company names
 * Uses multiple algorithms for better accuracy
 * 
 * @param {string} name1 - First company name
 * @param {string} name2 - Second company name
 * @returns {Object} Match result with score and confidence level
 * @example
 * fuzzyMatchCompany('Acme Corporation', 'Acme Corp Inc.')
 * // Returns: { score: 0.92, confidence: 'high', match: true }
 */
const fuzzyMatchCompany = (name1, name2) => {
  if (!name1 || !name2 || typeof name1 !== 'string' || typeof name2 !== 'string') {
    return { score: 0, confidence: 'none', match: false };
  }
  
  const original1 = name1.trim();
  const original2 = name2.trim();
  
  // Exact match check
  if (original1.toLowerCase() === original2.toLowerCase()) {
    return { score: 1.0, confidence: 'exact', match: true };
  }
  
  // Normalize both names
  const normalized1 = normalizeCompanyName(original1);
  const normalized2 = normalizeCompanyName(original2);
  
  if (normalized1 === normalized2 && normalized1.length > 0) {
    return { score: 0.95, confidence: 'high', match: true };
  }
  
  // Calculate Levenshtein similarity on normalized names
  const normalizedSimilarity = calculateSimilarity(normalized1, normalized2);
  
  // Calculate similarity on original names
  const originalSimilarity = calculateSimilarity(original1, original2);
  
  // Check for substring match (one is contained within the other)
  let substringScore = 0;
  if (normalized1.length > 3 && normalized2.length > 3) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const longer = Math.max(normalized1.length, normalized2.length);
      const shorter = Math.min(normalized1.length, normalized2.length);
      substringScore = shorter / longer;
    }
  }
  
  // Weighted combined score
  const combinedScore = Math.max(
    normalizedSimilarity * 0.5 + originalSimilarity * 0.3 + substringScore * 0.2,
    substringScore * 0.9 // Boost for substring matches
  );
  
  // Determine confidence level
  let confidence = 'none';
  let isMatch = false;
  
  if (combinedScore >= 0.9) {
    confidence = 'very_high';
    isMatch = true;
  } else if (combinedScore >= 0.8) {
    confidence = 'high';
    isMatch = true;
  } else if (combinedScore >= 0.7) {
    confidence = 'medium';
    isMatch = false; // Suggest manual review
  } else if (combinedScore >= 0.5) {
    confidence = 'low';
    isMatch = false;
  }
  
  return {
    score: Math.round(combinedScore * 100) / 100,
    confidence,
    match: isMatch,
    normalized: { name1: normalized1, name2: normalized2 }
  };
};

/**
 * Checks for duplicate person by email in Twenty CRM
 * Makes API call to search for existing records
 * 
 * @param {string} email - Email address to check
 * @param {string} crmBase - Twenty CRM base URL (e.g., https://crm.zaplit.com)
 * @param {string} apiToken - Twenty CRM API token
 * @returns {Promise<Object>} Duplicate check result
 * @example
 * await checkDuplicatePerson('john@example.com', 'https://crm.zaplit.com', 'token')
 * // Returns: { duplicate: true, record: {...}, action: 'merge' }
 */
const checkDuplicatePerson = async (email, crmBase, apiToken) => {
  const result = {
    duplicate: false,
    record: null,
    action: 'create', // 'create', 'merge', or 'skip'
    confidence: 'none',
    error: null
  };
  
  // Validate inputs
  if (!email || typeof email !== 'string') {
    result.error = 'Invalid email provided';
    return result;
  }
  
  if (!crmBase || !apiToken) {
    result.error = 'CRM configuration missing';
    return result;
  }
  
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Search for person by email using Twenty CRM REST API
    const response = await fetch(
      `${crmBase}/rest/people?filter=emails[contains]=${encodeURIComponent(normalizedEmail)}&limit=1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const existingRecord = data.data[0];
      
      // Check for exact email match
      const emails = existingRecord.emails || [];
      const exactMatch = emails.some(e => 
        e.email?.toLowerCase().trim() === normalizedEmail
      );
      
      if (exactMatch) {
        result.duplicate = true;
        result.record = existingRecord;
        result.confidence = 'exact';
        result.action = 'merge';
        result.personId = existingRecord.id;
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('Error checking duplicate person:', error);
    result.error = error.message;
    // Fail open - allow creation if check fails
    result.action = 'create';
    return result;
  }
};

/**
 * Checks for duplicate company by name in Twenty CRM
 * Uses both exact and fuzzy matching
 * 
 * @param {string} name - Company name to check
 * @param {string} crmBase - Twenty CRM base URL
 * @param {string} apiToken - Twenty CRM API token
 * @param {Object} options - Options for fuzzy matching
 * @param {number} options.fuzzyThreshold - Minimum score for fuzzy match (0-1, default: 0.85)
 * @returns {Promise<Object>} Duplicate check result
 * @example
 * await checkDuplicateCompany('Acme Corp', 'https://crm.zaplit.com', 'token')
 * // Returns: { duplicate: true, record: {...}, matchScore: 0.92, action: 'merge' }
 */
const checkDuplicateCompany = async (name, crmBase, apiToken, options = {}) => {
  const result = {
    duplicate: false,
    record: null,
    action: 'create',
    confidence: 'none',
    matchScore: 0,
    matchType: null, // 'exact', 'fuzzy', or null
    error: null
  };
  
  const fuzzyThreshold = options.fuzzyThreshold || 0.85;
  
  // Validate inputs
  if (!name || typeof name !== 'string') {
    result.error = 'Invalid company name provided';
    return result;
  }
  
  if (!crmBase || !apiToken) {
    result.error = 'CRM configuration missing';
    return result;
  }
  
  const normalizedName = name.toLowerCase().trim();
  
  try {
    // First, try exact match search
    const exactResponse = await fetch(
      `${crmBase}/rest/companies?filter=name[eq]=${encodeURIComponent(normalizedName)}&limit=5`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    if (!exactResponse.ok) {
      throw new Error(`HTTP error! status: ${exactResponse.status}`);
    }
    
    const exactData = await exactResponse.json();
    
    if (exactData.data && exactData.data.length > 0) {
      // Check for exact match
      const exactMatch = exactData.data.find(c => 
        c.name?.toLowerCase().trim() === normalizedName
      );
      
      if (exactMatch) {
        result.duplicate = true;
        result.record = exactMatch;
        result.confidence = 'exact';
        result.matchScore = 1.0;
        result.matchType = 'exact';
        result.action = 'merge';
        result.companyId = exactMatch.id;
        return result;
      }
    }
    
    // If no exact match, try broader search for fuzzy matching
    const searchTerm = normalizedName.split(' ')[0]; // Use first word for broader search
    const fuzzyResponse = await fetch(
      `${crmBase}/rest/companies?filter=name[ilike]=%${encodeURIComponent(searchTerm)}%&limit=20`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    if (!fuzzyResponse.ok) {
      throw new Error(`HTTP error! status: ${fuzzyResponse.status}`);
    }
    
    const fuzzyData = await fuzzyResponse.json();
    
    if (fuzzyData.data && fuzzyData.data.length > 0) {
      let bestMatch = null;
      let bestScore = 0;
      
      for (const company of fuzzyData.data) {
        const match = fuzzyMatchCompany(name, company.name);
        
        if (match.score > bestScore) {
          bestScore = match.score;
          bestMatch = company;
        }
      }
      
      if (bestMatch && bestScore >= fuzzyThreshold) {
        result.duplicate = true;
        result.record = bestMatch;
        result.matchScore = bestScore;
        result.matchType = 'fuzzy';
        result.companyId = bestMatch.id;
        
        if (bestScore >= 0.95) {
          result.confidence = 'very_high';
          result.action = 'merge';
        } else if (bestScore >= 0.9) {
          result.confidence = 'high';
          result.action = 'merge';
        } else if (bestScore >= fuzzyThreshold) {
          result.confidence = 'medium';
          result.action = 'review'; // Flag for manual review
        }
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('Error checking duplicate company:', error);
    result.error = error.message;
    result.action = 'create';
    return result;
  }
};

/**
 * Batch checks multiple records for duplicates
 * More efficient for processing form submissions in bulk
 * 
 * @param {Array} records - Array of records to check (each with email and/or company)
 * @param {string} crmBase - Twenty CRM base URL
 * @param {string} apiToken - Twenty CRM API token
 * @returns {Promise<Array>} Array of duplicate check results
 */
const batchCheckDuplicates = async (records, crmBase, apiToken) => {
  if (!Array.isArray(records)) {
    return [{ error: 'Records must be an array' }];
  }
  
  const results = [];
  
  for (const record of records) {
    const personCheck = record.email 
      ? await checkDuplicatePerson(record.email, crmBase, apiToken)
      : { duplicate: false };
    
    const companyCheck = record.company
      ? await checkDuplicateCompany(record.company, crmBase, apiToken)
      : { duplicate: false };
    
    results.push({
      input: record,
      person: personCheck,
      company: companyCheck,
      hasDuplicates: personCheck.duplicate || companyCheck.duplicate,
      recommendedAction: personCheck.duplicate || companyCheck.duplicate ? 'review' : 'create'
    });
  }
  
  return results;
};

/**
 * Generates merge recommendation for duplicate records
 * Analyzes existing and new data to suggest field-level merges
 * 
 * @param {Object} existingRecord - Existing CRM record
 * @param {Object} newData - New form data
 * @returns {Object} Merge recommendation with field mappings
 * @example
 * generateMergeRecommendation(existingPerson, newFormData)
 * // Returns: { strategy: 'update', fields: {...}, conflicts: [...] }
 */
const generateMergeRecommendation = (existingRecord, newData) => {
  const recommendation = {
    strategy: 'update', // 'update', 'skip', or 'manual'
    fields: {},
    conflicts: [],
    newData: {},
    reasoning: []
  };
  
  if (!existingRecord) {
    recommendation.strategy = 'create';
    recommendation.reasoning.push('No existing record found');
    return recommendation;
  }
  
  // Compare and suggest merges for common fields
  const fieldMappings = {
    'jobTitle': ['jobTitle', 'title', 'role'],
    'phone': ['phone', 'phoneNumber', 'mobile'],
    'linkedin': ['linkedin', 'linkedinUrl'],
    'twitter': ['twitter', 'twitterHandle']
  };
  
  for (const [crmField, inputFields] of Object.entries(fieldMappings)) {
    const existingValue = existingRecord[crmField];
    
    for (const inputField of inputFields) {
      const newValue = newData[inputField];
      
      if (newValue && (!existingValue || existingValue === '')) {
        // New data fills empty field - use it
        recommendation.fields[crmField] = newValue;
        recommendation.newData[crmField] = newValue;
      } else if (newValue && existingValue && newValue !== existingValue) {
        // Conflict - flag for review
        recommendation.conflicts.push({
          field: crmField,
          existing: existingValue,
          new: newValue
        });
      }
    }
  }
  
  // Determine final strategy
  if (recommendation.conflicts.length > 0) {
    recommendation.strategy = 'manual';
    recommendation.reasoning.push(`${recommendation.conflicts.length} field conflicts detected`);
  } else if (Object.keys(recommendation.newData).length === 0) {
    recommendation.strategy = 'skip';
    recommendation.reasoning.push('No new information to add');
  } else {
    recommendation.reasoning.push(`${Object.keys(recommendation.newData).length} new fields to update`);
  }
  
  return recommendation;
};

/**
 * Main duplicate detection orchestrator
 * Combines person and company checks with smart recommendations
 * 
 * @param {Object} formData - Form data to check
 * @param {string} crmBase - Twenty CRM base URL
 * @param {string} apiToken - Twenty CRM API token
 * @returns {Promise<Object>} Complete duplicate detection result
 */
const detectDuplicates = async (formData, crmBase, apiToken) => {
  const result = {
    hasDuplicates: false,
    person: null,
    company: null,
    recommendations: {},
    errors: []
  };
  
  // Check for person duplicate
  if (formData.email) {
    result.person = await checkDuplicatePerson(formData.email, crmBase, apiToken);
    if (result.person.duplicate) {
      result.hasDuplicates = true;
      result.recommendations.person = generateMergeRecommendation(
        result.person.record,
        formData
      );
    }
  }
  
  // Check for company duplicate
  if (formData.company) {
    result.company = await checkDuplicateCompany(formData.company, crmBase, apiToken);
    if (result.company.duplicate) {
      result.hasDuplicates = true;
      result.recommendations.company = generateMergeRecommendation(
        result.company.record,
        { name: formData.company }
      );
    }
  }
  
  // Determine overall action
  if (!result.hasDuplicates) {
    result.action = 'create';
  } else if (result.recommendations.person?.strategy === 'manual' || 
             result.recommendations.company?.strategy === 'manual') {
    result.action = 'manual_review';
  } else {
    result.action = 'merge';
  }
  
  return result;
};

// Export for n8n compatibility (CommonJS)
module.exports = {
  // Core functions
  checkDuplicatePerson,
  checkDuplicateCompany,
  detectDuplicates,
  
  // Fuzzy matching utilities
  fuzzyMatchCompany,
  calculateSimilarity,
  normalizeCompanyName,
  levenshteinDistance,
  
  // Batch processing
  batchCheckDuplicates,
  
  // Merge utilities
  generateMergeRecommendation
};

// Also export for ES modules
if (typeof exports !== 'undefined') {
  exports.checkDuplicatePerson = checkDuplicatePerson;
  exports.checkDuplicateCompany = checkDuplicateCompany;
  exports.detectDuplicates = detectDuplicates;
  exports.fuzzyMatchCompany = fuzzyMatchCompany;
  exports.calculateSimilarity = calculateSimilarity;
  exports.normalizeCompanyName = normalizeCompanyName;
  exports.levenshteinDistance = levenshteinDistance;
  exports.batchCheckDuplicates = batchCheckDuplicates;
  exports.generateMergeRecommendation = generateMergeRecommendation;
}
