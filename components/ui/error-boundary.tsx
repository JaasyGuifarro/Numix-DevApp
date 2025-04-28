"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Error caught by ErrorBoundary:", error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-white">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-semibold">Algo salió mal</h3>
          </div>
          <p className="text-sm text-gray-300 mb-4">
            {this.state.error?.message || "Ha ocurrido un error inesperado."}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Intentar de nuevo
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

