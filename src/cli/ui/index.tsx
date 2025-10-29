import { render } from '@opentui/react'
import { config } from 'dotenv'
import { useEffect, useState } from 'react'
import { validateEnv } from '@/lib/validate'
import { EnvSetup } from './components/EnvSetup'

function AppWrapper() {
	const [isEnvValid, setIsEnvValid] = useState(false)
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const [appComponent, setAppComponent] = useState<any>(null)

	useEffect(() => {
		const checkEnv = () => {
			const { success } = validateEnv()
			setIsEnvValid(success)

			// Se o ambiente já for válido, carrega o componente App
			if (success) {
				loadAppComponent()
			}
		}

		checkEnv()
	}, [])

	const loadAppComponent = async () => {
		const App = await import('./app').then((i) => i.App)
		setAppComponent(() => App)
	}

	const handleEnvComplete = async () => {
		await Bun.sleep(500) // Mantém o delay existente
		config()
		await loadAppComponent()
		setIsEnvValid(true)
	}

	// Se o ambiente é válido e o componente App foi carregado, renderiza o App
	if (isEnvValid && appComponent) {
		const App = appComponent
		return <App />
	}

	// Caso contrário, renderiza o EnvSetup
	return <EnvSetup onComplete={handleEnvComplete} />
}

// Carrega as configurações do dotenv antes de renderizar
config()
render(<AppWrapper />)
