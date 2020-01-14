import { getOptions, urlToRequest } from 'loader-utils';
import path from 'path';
import sassLoader from 'sass-loader';
import importsToResolve from 'sass-loader/dist/importsToResolve';

import { getScssThemePath } from './loaderUtils';
import { compileThemeVariables } from './utils';

/**
 * Utility returning a node-sass importer that provides access to all of antd's theme variables.
 * @param {string} themeScssPath - Path to SCSS file containing Ant Design theme variables.
 * @param {string} contents - The compiled content of the SCSS file at themeScssPath.
 * @param {Object} webpackContext - Webpack context to extract settings.
 * @returns {function} Importer that provides access to all compiled Ant Design theme variables
 *   when importing the theme file at themeScssPath.
 */
export const themeImporter = (themeScssPath, contents, webpackContext) => (url, previousResolve, done) => {
	const request = urlToRequest(url);
	const pathsToTry = importsToResolve(request);

	const baseDirectory = path.dirname(previousResolve);

	let aliases = {};
	if (webpackContext) {
		// eslint-disable-next-line no-underscore-dangle
		aliases = webpackContext._compiler.options.resolve.alias ?? {};
	}

	for (let i = 0; i < pathsToTry.length; i += 1) {
		const potentialResolve = pathsToTry[i];
		if (path.resolve(baseDirectory, potentialResolve) === themeScssPath) {
			done({ contents });
			return;
		}

		const hasAliases = Object.getOwnPropertyNames(aliases).length !== 0;
		const [root, ...dir] = potentialResolve.toString().split('/');
		if (hasAliases && !!aliases[root] && path.resolve(aliases[root], ...dir) === themeScssPath) {
			done({ contents });
			return;
		}
	}
	done();
};

/**
 * Modify sass-loader's options so that all antd variables are imported from the SCSS theme file.
 * @param {Object} options - Options for sass-loader.
 * @param {Object} webpackContext - Webpack context to extract settings.
 * @return {Object} Options modified to includ a custom importer that handles the SCSS theme file.
 */
export const overloadSassLoaderOptions = async (options, webpackContext) => {
	const newOptions = { ...options };
	const scssThemePath = getScssThemePath(options);

	const contents = await compileThemeVariables(scssThemePath);
	const extraImporter = themeImporter(scssThemePath, contents, webpackContext);

	let importer;
	if ('importer' in options) {
		if (Array.isArray(options.importer)) {
			importer = [...options.importer, extraImporter];
		} else {
			importer = [options.importer, extraImporter];
		}
	} else {
		importer = extraImporter;
	}

	newOptions.sassOptions = { importer };

	return newOptions;
};

/**
 * A wrapper around sass-loader which overloads loader options to include a custom importer handling
 * variable imports from the SCSS theme file, and registers the theme file as a watched dependency.
 * @param {...*} args - Arguments passed to sass-loader.
 * @return {undefined}
 */
export default function antdSassLoader(...args) {
	const loaderContext = this;
	const callback = loaderContext.async();
	const options = getOptions(loaderContext);

	const newLoaderContext = { ...loaderContext };

	overloadSassLoaderOptions(options, newLoaderContext)
		.then(newOptions => {
			delete newOptions.scssThemePath; // eslint-disable-line no-param-reassign
			newLoaderContext.query = newOptions;

			const scssThemePath = getScssThemePath(options);
			newLoaderContext.addDependency(scssThemePath);

			return sassLoader.call(newLoaderContext, ...args);
		})
		.catch(error => {
			// Remove unhelpful stack from error.
			error.stack = undefined; // eslint-disable-line no-param-reassign
			callback(error);
		});
}
