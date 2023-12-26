import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Translation Contribution Client',
  description: 'Contribute translations by running this application in the background.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className + " bg-gradient-to-tr from-orange-200 to-blue-200 to-65%"}>{children}</body>
    </html>
  )
}
