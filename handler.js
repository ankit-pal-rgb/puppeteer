// const chromium = require('chrome-aws-lambda')
// const puppeteer = require('puppeteer-core')
const axios = require('axios')
const sharp = require('sharp')
const Vibrant = require('node-vibrant/node').default
const cheerio = require('cheerio')
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core')

exports.run = async (event) => {
	const body = JSON.parse(event.body || '{}')

	if (!body.url) {
		return {
			statusCode: 400,
			body: JSON.stringify({ error: 'Missing URL in request body' }),
		}
	}

	// Normalize logo URL
	function normalizeLogoUrl(logoUrl) {
		const match = logoUrl.match(/(.+\.(png|jpg|jpeg|gif|svg))/i)
		return match ? match[1] : logoUrl
	}

	// Extract colors from logo
	async function extractColorsFromLogo(logoUrl) {
		try {
			const response = await axios.get(logoUrl, { responseType: 'arraybuffer' })
			const buffer = Buffer.from(response.data, 'binary')
			const isSvg = response.headers['content-type'] === 'image/svg+xml'

			const processedBuffer = isSvg ? await sharp(buffer).png().toBuffer() : buffer
			const palette = await Vibrant.from(processedBuffer).getPalette()

			return Object.values(palette)
				.filter((swatch) => swatch && swatch._population > 1)
				.map((swatch) => swatch.hex)
		} catch (error) {
			console.error(`Error extracting colors: ${error.message}`)
			return []
		}
	}

	// Validate and format URL
	function validateAndFormatURL(inputUrl) {
		try {
			return new URL(inputUrl).href
		} catch {
			if (!inputUrl.startsWith('http')) {
				try {
					return new URL(`http://${inputUrl}`).href
				} catch {
					return null
				}
			}
			return null
		}
	}

	let browser
	try {
		const validatedUrl = validateAndFormatURL(body.url)
		if (!validatedUrl) {
			return {
				statusCode: 400,
				body: JSON.stringify({ error: 'Invalid URL' }),
			}
		}

		// Launch Puppeteer in Lambda
		const browser = await puppeteer.launch({
				args: chromium.args,
				defaultViewport: chromium.defaultViewport,
				executablePath: await chromium.executablePath(),
				headless: chromium.headless,
			});

		const page = await browser.newPage()
		await page.setUserAgent(
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36'
		)
		await page.setViewport({ width: 1200, height: 800 })
		await page.setExtraHTTPHeaders({
			'Accept-Language': 'en-US,en;q=0.9',
			Referer: validatedUrl,
		})

		await page.goto(validatedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

		// Try waiting for a footer to improve content load certainty
		try {
			await page.waitForSelector('footer', { timeout: 15000 })
		} catch {
			const hasFooter = await page.evaluate(() => {
				return (
					!!document.querySelector('[id="footer"]') ||
					!!document.querySelector('[class*="footer"]')
				)
			})
			if (!hasFooter) throw new Error('Footer not found')
		}

		const content = await page.content()
		const $ = cheerio.load(content)
		const baseUrl = new URL(validatedUrl).origin

		const businessName =
			$('meta[property="og:site_name"]').attr('content') || $('title').text().trim() || ''

		const description =
			$('meta[name="description"]').attr('content') ||
			$('meta[property="og:description"]').attr('content') ||
			''

		let logo = `https://logo.clearbit.com/${new URL(validatedUrl).hostname}`

		try {
			const logoResp = await page.goto(logo)
			if (!logoResp || !logoResp.ok()) {
				const logoElement = $('img[src*="logo"], img[src*="Logo"]').first()
				const logoSrc = logoElement.attr('src')
				logo = logoSrc
					? normalizeLogoUrl(logoSrc.startsWith('http') ? logoSrc : new URL(logoSrc, baseUrl).href)
					: null
			}
		} catch {
			logo = null
		}

		const socialAccountsSet = new Set()
		$('a[href]').each((_, element) => {
			const href = $(element).attr('href')
			if (
				href.includes('facebook.com') ||
				href.includes('twitter.com') ||
				href.includes('instagram.com') ||
				href.includes('linkedin.com') ||
				href.includes('pinterest.com')
			) {
				socialAccountsSet.add(href)
			}
		})

		const colors = logo ? await extractColorsFromLogo(logo) : []

		return {
			statusCode: 200,
			body: JSON.stringify({
				business_name: businessName,
				description,
				logo,
				colors,
				socials: Array.from(socialAccountsSet),
			}),
		}
	} catch (err) {
		console.error('Handler error:', err.message)
		return {
			statusCode: 500,
			body: JSON.stringify({ error: 'Failed to extract business data' }),
		}
	} finally {
		if (browser) await browser.close()
	}
}