import { useEffect, useState } from 'react'
import { colors } from '../utils/types'

export function Spinner({
	size = 'medium',
}: {
	size?: 'small' | 'medium' | 'large'
}) {
	const [frame, setFrame] = useState(0)
	const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((prev) => (prev + 1) % frames.length)
		}, 80)
		return () => clearInterval(interval)
	}, [])

	return <text fg={colors.accent}>{frames[frame]}</text>
}
