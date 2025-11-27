# Contributing to Radiolla

Thank you for your interest in contributing to Radiolla! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. Check existing [Issues](../../issues) to avoid duplicates
2. Create a new issue using the bug report template
3. Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Platform (Web/Android/Windows)
   - Screenshots if applicable

### Suggesting Features

1. Check existing issues for similar suggestions
2. Create a new issue with the feature request template
3. Describe the feature and its use case

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run type checking: `npm run typecheck`
5. Commit with clear messages: `git commit -m "Add: your feature description"`
6. Push to your fork: `git push origin feature/your-feature`
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/radiolla.git
cd radiolla

# Install dependencies
npm install

# Start development
npm start
```

## Commit Message Format

Use clear, descriptive commit messages:

- `Add: new feature description`
- `Fix: bug description`
- `Update: what was updated`
- `Remove: what was removed`
- `Docs: documentation changes`

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Add comments for complex logic
- Keep components small and focused

## Testing

Before submitting a PR:

```bash
# Type check
npm run typecheck

# Test web build
npm run web:export

# Test on target platform
npm run web        # Web
npm run android    # Android
npm run electron   # Desktop
```

## Questions?

Feel free to open an issue for any questions about contributing.
