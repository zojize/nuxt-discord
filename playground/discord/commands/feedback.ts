/**
 * @description Submit feedback via a modal form
 */
export default () => {
  return reply.modal('Submit Feedback', {
    subject: { style: 'short', placeholder: 'What is this about?', maxLength: 100 },
    details: { style: 'paragraph', placeholder: 'Tell us more...', required: false },
    rating: { style: 'short', placeholder: '1-5', maxLength: 1 },
  }, (values) => {
    const lines = [
      `**Feedback Received**`,
      `**Subject:** ${values.subject}`,
      values.details ? `**Details:** ${values.details}` : null,
      `**Rating:** ${'★'.repeat(Number(values.rating) || 0)}${'☆'.repeat(5 - (Number(values.rating) || 0))}`,
    ].filter(Boolean)
    return reply.ephemeral(lines.join('\n'))
  })
}
