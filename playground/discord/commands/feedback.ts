/**
 * @description Submit feedback via a modal form
 */
export default () => {
  return reply.modal('Submit Feedback', {
    subject: { style: 'short', placeholder: 'What is this about?', maxLength: 100 },
    details: { style: 'paragraph', placeholder: 'Tell us more...', required: false },
    rating: { style: 'short', placeholder: '1-5', maxLength: 1 },
  }, (values) => {
    const rating = Number(values.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return reply.ephemeral('Enter a rating from 1 to 5.')

    const lines = [
      `**Feedback Received**`,
      `**Subject:** ${values.subject}`,
      values.details ? `**Details:** ${values.details}` : null,
      `**Rating:** ${'★'.repeat(rating)}${'☆'.repeat(5 - (rating))}`,
    ].filter(Boolean)
    return reply.ephemeral(lines.join('\n'))
  })
}
