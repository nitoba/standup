import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useCallback, useEffect, useState } from 'react'
import {
	type EnvVars,
	getEnvDescriptions,
	saveEnvFile,
	validateEnv,
} from '@/lib/env/validate'
import { COLORS } from '../constants/colors'

interface EnvSetupProps {
	onComplete: () => void
}

export function EnvSetup({ onComplete }: EnvSetupProps) {
	const { height } = useTerminalDimensions()
	const [envVars, setEnvVars] = useState<Partial<EnvVars>>({})
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [isLoading, setIsLoading] = useState(false)
	const [missingVars, setMissingVars] = useState<string[]>([])
	const [focusedField, setFocusedField] = useState(0)

	useEffect(() => {
		const validation = validateEnv()
		if (validation.success) {
			onComplete()
		} else if (validation.missing) {
			setMissingVars(validation.missing)
			const initialValues: Partial<EnvVars> = {}
			validation.missing.forEach((key) => {
				const value = process.env[key] || ''
				initialValues[key as keyof EnvVars] = value
			})
			setEnvVars(initialValues)
		}
	}, [onComplete])

	const handleInputChange = useCallback(
		(key: string, value: string) => {
			setEnvVars((prev) => ({ ...prev, [key]: value }))
			if (errors[key]) {
				setErrors((prev) => {
					const newErrors = { ...prev }
					delete newErrors[key]
					return newErrors
				})
			}
		},
		[errors]
	)

	const validateForm = useCallback((): boolean => {
		const newErrors: Record<string, string> = {}

		missingVars.forEach((key) => {
			const value = envVars[key as keyof EnvVars]
			if (!value || value.trim() === '') {
				newErrors[key] = 'Required field'
			} else if (key.includes('EMAIL') && !value.includes('@')) {
				newErrors[key] = 'Invalid email format'
			}
		})

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}, [envVars, missingVars])

	const handleSubmit = useCallback(async () => {
		if (!validateForm()) {
			return
		}

		setIsLoading(true)
		try {
			saveEnvFile(envVars)
			onComplete()
		} catch (error) {
			setErrors({
				submit: 'Failed to save environment variables',
			})
		} finally {
			setIsLoading(false)
		}
	}, [envVars, validateForm, onComplete])

	useKeyboard((key) => {
		if (key.name === 'tab') {
			setFocusedField((prev) => (prev + 1) % missingVars.length)
		} else if (key.name === 'shift+tab') {
			setFocusedField(
				(prev) => (prev - 1 + missingVars.length) % missingVars.length
			)
		} else if (key.name === 'escape') {
			process.exit(0)
		}
	})
	const completedFields = missingVars.filter((key) =>
		envVars[key as keyof EnvVars]?.trim()
	).length
	const progress =
		missingVars.length > 0 ? (completedFields / missingVars.length) * 100 : 0

	const getFieldIcon = (key: string) => {
		if (key.includes('EMAIL')) return '📧'
		if (key.includes('NAME')) return '👤'
		if (key.includes('PAT') || key.includes('KEY')) return '🔑'
		if (key.includes('FOLDER')) return '📁'
		return '⚙️'
	}

	return (
		<box flexDirection="column" padding={1} height={height}>
			{/* Header */}
			<box
				title="Environment Setup"
				border
				borderStyle="rounded"
				borderColor={COLORS.text}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				flexDirection="row"
				justifyContent="space-between"
				margin={0}
			>
				<box margin={0}>
					<text fg={COLORS.info} marginBottom={2}>
						Configure your environment variables to continue
					</text>
					<text fg={COLORS.dim}>Configuration will be saved to .env file</text>
				</box>

				<text>
					Progress: {completedFields}/{missingVars.length} (
					{Math.floor(progress)}%)
				</text>
			</box>

			{errors.submit && (
				<box border padding={1} marginBottom={1}>
					<text fg={COLORS.error}>Error: {errors.submit}</text>
				</box>
			)}

			{/* Form Fields */}
			<scrollbox height={height * 0.8} marginTop={2}>
				{missingVars.map((key, index) => (
					<box
						key={key}
						title={`${getFieldIcon(key)} ${key}`}
						borderColor={
							envVars[key as keyof EnvVars] ? COLORS.success : COLORS.text
						}
						border
						flexDirection="column"
						rowGap={2}
						borderStyle="rounded"
						padding={1}
					>
						<box flexDirection="column" gap={1}>
							<text fg={COLORS.text}>
								{getEnvDescriptions()[key as keyof EnvVars]}
							</text>
							<box
								flexDirection="row"
								justifyContent="space-between"
								alignItems="center"
							>
								<input
									backgroundColor={COLORS.border}
									onPaste={(value) => handleInputChange(key, value.text)}
									placeholder={`Enter ${key.toLowerCase().replace(/_/g, ' ')}...`}
									value={envVars[key as keyof EnvVars] || ''}
									onInput={(value) => handleInputChange(key, value)}
									onSubmit={handleSubmit}
									style={{
										width: '100%',
										textColor: COLORS.text,
										placeholderColor: COLORS.dim,
										padding: 1,
									}}
									focused={focusedField === index}
								/>
							</box>
						</box>

						{errors[key] && (
							<text fg={COLORS.error} marginTop={1}>
								{errors[key]}
							</text>
						)}
					</box>
				))}
			</scrollbox>

			{/* Actions */}
			<box flexDirection="row" justifyContent="flex-end">
				<text fg={isLoading ? COLORS.dim : COLORS.success}>
					{isLoading ? 'Saving...' : 'Enter: Save & Continue'}
				</text>
			</box>
		</box>
	)
}
