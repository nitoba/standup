import { useTerminalDimensions } from '@opentui/react'
import { COLORS } from '../constants/colors'

interface ReportPreviewProps {
	report: string
	filePath: string
}

export function ReportPreview({ report, filePath }: ReportPreviewProps) {
	const { height } = useTerminalDimensions()
	const reportLines = report.split('\n')

	return (
		<box
			title="📄 Report Generated"
			border
			borderStyle="single"
			style={{
				height: height * 0.58,
				backgroundColor: `${COLORS.success}20`,
			}}
		>
			<box
				flexDirection="row"
				justifyContent="space-between"
				style={{ marginLeft: 1 }}
			>
				<text fg={COLORS.dim}>File: {filePath}</text>
			</box>

			<box
				border
				borderStyle="single"
				style={{
					backgroundColor: COLORS.background,
					height: 'auto',
				}}
			>
				<scrollbox
					style={{
						width: '100%',
						height: '100%',
						backgroundColor: 'transparent',
					}}
				>
					{reportLines.map((line, index) => (
						<text key={index} fg={COLORS.text} style={{ marginLeft: 1 }}>
							{line || ' '}
						</text>
					))}
				</scrollbox>
			</box>

			<box
				flexDirection="row"
				justifyContent="space-between"
				style={{ paddingTop: 1, marginLeft: 1, marginRight: 1 }}
			>
				<text fg={COLORS.dim}>Size: {report.length} chars</text>
				<text fg={COLORS.dim}>Lines: {reportLines.length}</text>
			</box>
		</box>
	)
}
