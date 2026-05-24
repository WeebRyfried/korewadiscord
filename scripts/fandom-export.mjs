#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const API = 'https://korewadiscord-underground.fandom.com/api.php';
const OUT_DIR = 'wiki/import/fandom';
const META_DIR = join( OUT_DIR, 'meta' );
const FILE_DIR = join( OUT_DIR, 'files' );
const USER_AGENT = 'KorewaDiscordWikiMigration/1.0';
const EXPORT_BATCH_SIZE = 50;

const sleep = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );

async function apiGet( params ) {
	const url = new URL( API );

	for ( const [ key, value ] of Object.entries( params ) ) {
		url.searchParams.set( key, value );
	}

	url.searchParams.set( 'format', 'json' );
	url.searchParams.set( 'formatversion', '2' );

	const response = await fetch( url, {
		headers: { 'User-Agent': USER_AGENT }
	} );

	if ( !response.ok ) {
		throw new Error( `Fandom API ${response.status} for ${url}` );
	}

	return response.json();
}

async function listNamespaces() {
	const data = await apiGet( {
		action: 'query',
		meta: 'siteinfo',
		siprop: 'namespaces'
	} );

	return Object.entries( data.query.namespaces )
		.map( ( [ id, namespace ] ) => ( {
			id: Number( id ),
			name: namespace.name || '',
			canonical: namespace.canonical || namespace.name || ''
		} ) )
		.filter( ( namespace ) => namespace.id >= 0 );
}

async function listPagesInNamespace( namespaceId ) {
	const pages = [];
	let apcontinue;

	do {
		const data = await apiGet( {
			action: 'query',
			list: 'allpages',
			apnamespace: String( namespaceId ),
			aplimit: 'max',
			apfilterredir: 'all',
			...( apcontinue ? { apcontinue } : {} )
		} );

		pages.push( ...data.query.allpages.map( ( page ) => page.title ) );
		apcontinue = data.continue?.apcontinue;
	} while ( apcontinue );

	return pages;
}

async function listAllPages() {
	const namespaces = await listNamespaces();
	const namespaceResults = [];
	const titles = [];

	for ( const namespace of namespaces ) {
		const pages = await listPagesInNamespace( namespace.id );
		namespaceResults.push( {
			...namespace,
			pages: pages.length
		} );
		titles.push( ...pages );
	}

	return { namespaces: namespaceResults, titles };
}

async function exportTitles( titles ) {
	let siteInfo = '';
	let pages = '';

	for ( let index = 0; index < titles.length; index += EXPORT_BATCH_SIZE ) {
		const batch = titles.slice( index, index + EXPORT_BATCH_SIZE );
		const url = new URL( API );
		url.searchParams.set( 'action', 'query' );
		url.searchParams.set( 'export', '1' );
		url.searchParams.set( 'exportnowrap', '1' );
		url.searchParams.set( 'titles', batch.join( '|' ) );

		const response = await fetch( url, {
			headers: { 'User-Agent': USER_AGENT }
		} );

		if ( !response.ok ) {
			throw new Error( `Fandom export ${response.status} for batch starting ${index}` );
		}

		const chunk = await response.text();
		if ( !siteInfo ) {
			const siteInfoMatch = chunk.match( /<siteinfo>[\s\S]*?<\/siteinfo>/ );
			siteInfo = siteInfoMatch ? siteInfoMatch[0] : '';
		}

		pages += ( chunk.match( /<page>[\s\S]*?<\/page>/g ) || [] ).join( '\n' ) + '\n';
		await sleep( 150 );
	}

	return `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.mediawiki.org/xml/export-0.11/ http://www.mediawiki.org/xml/export-0.11.xsd" version="0.11" xml:lang="en">\n${siteInfo}\n${pages}</mediawiki>\n`;
}

async function listImages() {
	const images = [];
	let aicontinue;

	do {
		const data = await apiGet( {
			action: 'query',
			list: 'allimages',
			ailimit: 'max',
			aiprop: 'name|url|mime|size|sha1|timestamp|user|comment',
			...( aicontinue ? { aicontinue } : {} )
		} );

		images.push( ...data.query.allimages );
		aicontinue = data.continue?.aicontinue;
	} while ( aicontinue );

	return images;
}

function imageFilename( image ) {
	return image.name.replace( /[\\/:*?"<>|]/g, '_' );
}

async function downloadImage( image ) {
	const url = new URL( image.url );
	url.searchParams.set( 'format', 'original' );

	const response = await fetch( url, {
		headers: { 'User-Agent': USER_AGENT }
	} );

	if ( !response.ok ) {
		throw new Error( `Image download ${response.status} for ${url}` );
	}

	const path = join( FILE_DIR, imageFilename( image ) );
	await pipeline( response.body, createWriteStream( path ) );

	return path;
}

async function main() {
	await mkdir( META_DIR, { recursive: true } );
	await rm( FILE_DIR, { force: true, recursive: true } );
	await mkdir( FILE_DIR, { recursive: true } );

	const { namespaces, titles } = await listAllPages();
	await writeFile( join( META_DIR, 'namespaces.json' ), JSON.stringify( namespaces, null, 2 ) + '\n' );
	await writeFile( join( META_DIR, 'titles.json' ), JSON.stringify( titles, null, 2 ) + '\n' );

	const xml = await exportTitles( titles );
	await writeFile( join( OUT_DIR, 'pages.xml' ), xml );

	const images = await listImages();
	const downloaded = [];

	for ( const image of images ) {
		const path = await downloadImage( image );
		downloaded.push( { ...image, downloadedPath: path } );
	}

	await writeFile( join( META_DIR, 'images.json' ), JSON.stringify( downloaded, null, 2 ) + '\n' );

	console.log( `Exported ${titles.length} pages from ${namespaces.length} namespaces.` );
	console.log( `Downloaded ${downloaded.length} files.` );
	console.log( `XML: ${join( OUT_DIR, 'pages.xml' )}` );
	console.log( `Files: ${FILE_DIR}` );
}

main().catch( ( error ) => {
	console.error( error );
	process.exit( 1 );
} );
