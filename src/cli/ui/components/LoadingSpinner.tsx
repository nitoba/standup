import { RGBA } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { COLORS } from '../constants/colors'

export function LoadingSpinner() {
	const { height, width } = useTerminalDimensions()

	return (
		<box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			height={height}
			width={width}
		>
			<ascii-font
				text="Iniciando..."
				font="block"
				fg={RGBA.fromHex(COLORS.dim)}
			/>
		</box>
	)
}
