interface ReviewMessagePayload {
  content: string
  components: []
}

interface ReviewMessageInteraction {
  editReply: (payload: ReviewMessagePayload) => Promise<unknown>
}

export async function updateReviewMessage(
  interaction: ReviewMessageInteraction,
  payload: ReviewMessagePayload,
): Promise<void> {
  await interaction.editReply(payload)
}
