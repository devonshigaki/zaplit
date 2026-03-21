# Contributing to Zaplit

Thank you for your interest in contributing to Zaplit! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/zaplit.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements
- `chore/` - Maintenance tasks

Example: `feature/add-user-authentication`

### Making Changes

1. Make your changes in your feature branch
2. Run tests: `pnpm test`
3. Run linting: `pnpm lint`
4. Run type checking: `pnpm typecheck`
5. Update documentation if needed

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, semicolons, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

### Examples

```
feat(auth): add JWT token validation

fix(api): resolve rate limiting issue

docs(readme): update installation instructions

refactor(components): simplify button component
```

## Pull Request Process

1. **Before Submitting**
   - Ensure all tests pass
   - Ensure code is properly formatted
   - Update relevant documentation
   - Add/update tests for new functionality

2. **PR Description**
   - Clear title following commit message format
   - Description of changes
   - Link to related issues
   - Screenshots for UI changes

3. **Review Process**
   - At least one approval required
   - All CI checks must pass
   - Address review feedback promptly
   - Maintain respectful communication

## Code Review Guidelines

### For Authors

- Keep PRs focused and reasonably sized
- Respond to feedback within 48 hours
- Explain complex logic with comments
- Be open to suggestions

### For Reviewers

- Review within 48 hours when possible
- Be constructive and respectful
- Explain reasoning for requested changes
- Approve when satisfied

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git

### Installation

```bash
# Install dependencies
pnpm install

# Start development server (zaplit-com)
pnpm dev:com

# Start development server (zaplit-org)
pnpm dev:org
```

### Working with the Monorepo

```bash
# Run commands in specific packages
cd zaplit-com && pnpm build
cd zaplit-org && pnpm test

# Run root-level commands
pnpm lint       # Lint all packages
pnpm typecheck  # Type check all packages
pnpm test       # Test all packages
```

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Specific package
cd zaplit-com && pnpm test

# With coverage
cd zaplit-com && pnpm test:coverage

# Watch mode
cd zaplit-com && pnpm test:watch
```

### Writing Tests

- Use Vitest for unit tests
- Use React Testing Library for component tests
- Place tests alongside source files (`.test.ts`)
- Aim for high test coverage on critical paths

### Test File Structure

```typescript
// example.test.ts
import { describe, it, expect } from 'vitest'

describe('Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true)
  })
})
```

## Documentation

### When to Update Documentation

- Adding new features
- Changing existing functionality
- Adding new API endpoints
- Modifying environment variables

### Documentation Structure

- `/docs/` - Main documentation
- `/docs/architecture/` - Architecture decisions
- `/docs/ops/` - Operational guides
- `/docs/development/` - Developer guides
- `README.md` - Package-level documentation

## Questions?

If you have questions:

1. Check existing documentation
2. Search closed issues
3. Open a new issue with the `question` label

Thank you for contributing to Zaplit!
