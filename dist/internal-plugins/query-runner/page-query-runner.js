"use strict";

var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require("babel-runtime/helpers/asyncToGenerator");

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Jobs of this module
 * - Ensure on bootstrap that all invalid page queries are run and report
 *   when this is done
 * - Watch for when a page's query is invalidated and re-run it.
 */

var _ = require(`lodash`);
var Promise = require(`bluebird`);

var _require = require(`../../redux`),
    store = _require.store,
    emitter = _require.emitter;

var queryRunner = require(`./query-runner`);

var queuedDirtyActions = [];
var active = false;

// Do initial run of graphql queries during bootstrap.
// Afterwards we listen "API_RUNNING_QUEUE_EMPTY" and check
// for dirty nodes before running queries.
exports.runQueries = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
  var dirtyIds, cleanIds;
  return _regenerator2.default.wrap(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          // Run queued dirty nodes now that we're active.
          queuedDirtyActions = _.uniq(queuedDirtyActions, function (a) {
            return a.payload.id;
          });
          dirtyIds = findDirtyIds(queuedDirtyActions);
          _context.next = 4;
          return runQueriesForIds(dirtyIds);

        case 4:

          queuedDirtyActions = [];

          // Find ids without data dependencies (i.e. no queries have been run for
          // them before) and run them.
          cleanIds = findIdsWithoutDataDependencies();

          // Run these pages

          _context.next = 8;
          return runQueriesForIds(cleanIds);

        case 8:

          active = true;
          return _context.abrupt("return");

        case 10:
        case "end":
          return _context.stop();
      }
    }
  }, _callee, undefined);
}));

emitter.on(`CREATE_NODE`, function (action) {
  queuedDirtyActions.push(action);
});

emitter.on(`DELETE_NODE`, function (action) {
  queuedDirtyActions.push({ payload: action.node });
});

var runQueuedActions = function () {
  var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
    var cleanIds;
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            if (!active) {
              _context2.next = 7;
              break;
            }

            queuedDirtyActions = _.uniq(queuedDirtyActions, function (a) {
              return a.payload.id;
            });
            _context2.next = 4;
            return runQueriesForIds(findDirtyIds(queuedDirtyActions));

          case 4:
            queuedDirtyActions = [];

            // Find ids without data dependencies (e.g. new pages) and run
            // their queries.
            cleanIds = findIdsWithoutDataDependencies();

            runQueriesForIds(cleanIds);

          case 7:
          case "end":
            return _context2.stop();
        }
      }
    }, _callee2, undefined);
  }));

  return function runQueuedActions() {
    return _ref2.apply(this, arguments);
  };
}();

// Wait until all plugins have finished running (e.g. various
// transformer plugins) before running queries so we don't
// query things in a 1/2 finished state.
emitter.on(`API_RUNNING_QUEUE_EMPTY`, runQueuedActions);

var findIdsWithoutDataDependencies = function findIdsWithoutDataDependencies() {
  var state = store.getState();
  var allTrackedIds = _.uniq(_.flatten(_.concat(_.values(state.componentDataDependencies.nodes), _.values(state.componentDataDependencies.connections))));

  // Get list of paths not already tracked and run the queries for these
  // paths.
  return _.difference([].concat(state.pages.map(function (p) {
    return p.path;
  }), state.layouts.map(function (l) {
    return `LAYOUT___${l.id}`;
  })), allTrackedIds);
};

var runQueriesForIds = function runQueriesForIds(ids) {
  ids = _.uniq(ids);
  if (ids.length < 1) {
    return Promise.resolve();
  }
  var state = store.getState();
  return Promise.all(ids.map(function (id) {
    var pagesAndLayouts = [].concat(state.pages, state.layouts);
    var plObj = pagesAndLayouts.find(function (pl) {
      return pl.path === id || `LAYOUT___${pl.id}` === id;
    });
    if (plObj) {
      return queryRunner(plObj, state.components[plObj.component]);
    }
  }));
};

var findDirtyIds = function findDirtyIds(actions) {
  var state = store.getState();
  return actions.reduce(function (dirtyIds, action) {
    var node = action.payload;

    // find invalid pagesAndLayouts
    dirtyIds = dirtyIds.concat(state.componentDataDependencies.nodes[node.id]);

    // Find invalid connections
    dirtyIds = dirtyIds.concat(state.componentDataDependencies.connections[node.internal.type]);

    return _.compact(dirtyIds);
  }, []);
};
//# sourceMappingURL=page-query-runner.js.map