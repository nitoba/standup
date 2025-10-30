import { render } from '@opentui/react'
import { config } from 'dotenv'
import { useEffect, useState } from 'react'
import { validateEnv } from '@/lib/env/validate'
import { EnvSetup } from './components/EnvSetup'
import { LoadingSpinner } from './components/LoadingSpinner'

function AppWrapper() {
	const [isEnvValid, setIsEnvValid] = useState<boolean | null>(null) // null = checking
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const [AppComponent, setAppComponent] = useState<any>(null)

	useEffect(() => {
		const checkEnv = async () => {
			const { success } = validateEnv()

			if (success) {
				// Se válido, carrega o App diretamente
				await loadAppComponent()
				setIsEnvValid(true)
			} else {
				// Se inválido, mostra o EnvSetup
				setIsEnvValid(false)
			}
		}

		checkEnv()
	}, [])

	const loadAppComponent = async () => {
		const App = await import('./app').then((i) => i.App)
		setAppComponent(() => App)
	}

	const handleEnvComplete = async () => {
		await Bun.sleep(500)
		config()
		await loadAppComponent()
		setIsEnvValid(true)
	}

	// Enquanto está verificando, não renderiza nada (ou pode mostrar um loading)
	if (isEnvValid === null) {
		return <LoadingSpinner />
	}

	// Se o ambiente é válido e o App foi carregado, renderiza o App
	if (isEnvValid && AppComponent) {
		return <AppComponent />
	}

	// Apenas mostra EnvSetup se o ambiente for explicitamente inválido
	if (!isEnvValid) {
		return <EnvSetup onComplete={handleEnvComplete} />
	}

	// Fallback: esperando carregar o App
	return null
}

// Carrega as configurações do dotenv antes de renderizar
config()
render(<AppWrapper />)
