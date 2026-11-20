import antfu from '@antfu/eslint-config'

export default antfu(
  {
    stylistic: true,
    rules: { 'antfu/reasonable-newline': 'off' },
    ignores: [
      'docs/superpowers/plans/**',
    ],
  },
)
