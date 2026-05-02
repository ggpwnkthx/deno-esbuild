# Conventional Commits

This project follows the
[Conventional Commits](https://www.conventionalcommits.org/) specification.

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `style`    | Changes that do not affect meaning (formatting, etc.)   |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or correcting tests                              |
| `build`    | Changes to build system or dependencies                 |
| `ci`       | Changes to CI configuration                             |
| `chore`    | Other changes that don't modify src or test files       |
| `revert`   | Reverts a previous commit                               |

## Examples

```
feat(core): add new configuration option
fix(api): resolve race condition in client
docs: update README with new examples
chore: update dependencies
```

## Commit Message Validation

The `commit-msg` hook validates that your commit messages follow this format.
