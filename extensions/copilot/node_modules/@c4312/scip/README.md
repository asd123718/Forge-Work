# @c4312/scip

~~This is a top-level repo mirror of the [SCIP TS/JS bindings](https://github.com/sourcegraph/scip/tree/main/bindings/typescript), available until they're [published on npm](https://github.com/sourcegraph/scip/issues/253).~~

The SCIP bindings provided by the upstream repo have [an issue](https://github.com/sourcegraph/scip/issues/274) which prevents parsing certain indices. This repo now generates bindings itself using the `protobufjs` module.

This repo is still intended as a temporary solution, so it is not published on NPM, but you may install it yourself by running:

```
npm install --save github:connor4312/scip-typescript-bindings
```
