/*
 * ***** BEGIN LICENSE BLOCK *****
 * 
 * Zimbra Collaboration Suite Web Client
 * Copyright (C) 2004, 2005, 2006, 2007 Zimbra, Inc.
 * 
 * The contents of this file are subject to the Yahoo! Public License
 * Version 1.0 ("License"); you may not use this file except in
 * compliance with the License.  You may obtain a copy of the License at
 * http://www.zimbra.com/license.
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * 
 * ***** END LICENSE BLOCK *****
 */

/**
 * Creates a layout manager from the given components.
 * @constructor
 * @class
 * <p>This class performs view and layout management. It expects there to be an HTML "skin" with
 * containers for various components. A container is an empty DIV with a known ID, so that we
 * can use it to place the corresponding component's content. A component is a widget; it is
 * the widget's HTML element that is positioned and sized based on the container's location and
 * size. The containers are part of the flow (they are positioned relatively), so their location
 * and size should be adjusted when necessary by the browser. The components are not children of
 * their containers within the DOM tree; they are children of the shell, and are positioned
 * absolutely. There appears to be a performance gain in keeping our HTML elements closer to the
 * top of the DOM tree, possibly because events do not propagate as far.
 *</p>
 *
 * <p>The following containers/components are supported:</p>
 *
 * <p><ul>
 *  <li>banner: displays logo</li>
 *  <li>user info: shows user name and quota info</li>
 *  <li>search bar: a text input and a few buttons</li>
 *  <li>search builder: a tool that helps the user construct a search query (initially hidden)</li>
 *  <li>search builder toolbar: toolbar for the search builder (initially hidden)</li>
 *  <li>current app: displays the name of the current app and its custom View menu (if any)</li>
 *  <li>app chooser: a vertical toolbar with buttons for changing apps, as well as Help etc.</li>
 *  <li>tree: displays folders, saved searches, and tags</li>
 *  <li>tree footer: displays mini-calendar (initially hidden)</li>
 *  <li>status: displays status messages</li>
 *  <li>sash: a thin moveable vertical bar for resizing the surrounding elements; it sits
 *            between the tree and the app content</li>
 *  <li>top toolbar: a view-specific toolbar</li>
 *  <li>app content: used to present data to the user</li>
 *  <li>bottom toolbar: not currently used</li>
 * </ul></p>
 *
 * <p>In general, the app view manager responds to changes in the skin by having each of the
 * affected components adapt to its container's new location and/or size. That means that
 * we are dependent on the browser to relocate and resize the containers within the skin
 * appropriately.</p>
 *
 * <p>The top and bottom toolbars and the app content are treated somewhat differently: they
 * come under the purview of "app view management". In general, an application represents a
 * view with a toolbar and a content area (which is often a list view). App view management
 * allows these views to be pushed and popped as if they were in a stack. That way, the views
 * only need be constructed once each.</p>
 *
 * <p>The app view components are hidden and shown using two methods: z-index and
 * relocation. Since every component hangs off the shell, it must have a z-index of at least Z_VIEW
 * (300) to be visible. It can be hidden by setting its z-index to Z_HIDDEN (100). Since
 * both IE and Firefox have display bugs related to the use of z-index, we use relocation as
 * well: a hidden component is positioned way off the screen. (In IE, SELECT fields don't
 * obey z-index, and in Firefox, the cursor bleeds through.)</p>
 *
 * <p>In the current model of view management, each type of view (see ZmController) has only one
 * instance at a given time. For example, we only ever track a single conv view. If we decide to do
 * view caching, the model would have to change so that we can have multiple instances of views.</p>
 *
 * <p>Views can open in a tab (in the row of app buttons) rather than replacing the current view. Those
 * are handled in essentially the same way (view push and pop), but they also manage the app button.
 * We currently manage only a single view in a tab. Stacking views within tabs is possible, but adds a
 * lot of complexity.
 *
 * @author Conrad Damon
 * 
 * @param shell			the outermost containing element
 * @param controller		the app controller
 * @param isNewWindow	true if we are a child window of the main app
 * @param hasSkin		true if the app has provided containing HTML
 */
ZmAppViewMgr = function(shell, controller, isNewWindow, hasSkin) {

	ZmAppViewMgr._setContainerIds();

	this._shell = shell;
	this._controller = controller;
	this._isNewWindow = isNewWindow;
	this._hasSkin = hasSkin;

	this._shellSz = this._shell.getSize();
	this._controlListener = new AjxListener(this, this._shellControlListener);
	this._shell.addControlListener(this._controlListener);
	this._sashSupported = (window.skin && typeof window.skin.setTreeWidth == "function");

	if (appCtxt.get(ZmSetting.HISTORY_SUPPORT_ENABLED) && !AjxEnv.isSafari && !isNewWindow && !AjxEnv.isPrism) {
		this._historyMgr = appCtxt.getHistoryMgr();
		this._historyMgr.addListener(new AjxListener(this, this._historyChangeListener));
	}
	this._hashView				= {};		// matches numeric hash to its view
	this._nextHashIndex			= 0;		// index for adding to browser history stack
	this._curHashIndex			= 0;		// index of current location in browser history stack
	this._noHistory				= false;	// flag to prevent history ops as result of programmatic push/pop view
	this._ignoreHistoryChange	= false;	// don't push/pop view as result of history.back() or history.forward()

	this._lastView		= null;	// ID of previously visible view
	this._currentView	= null;	// ID of currently visible view

	this._views			= {};	// hash that gives names to app views
	this._hidden		= [];	// stack of views that aren't visible

	this._appView		= {};	// hash matching an app name to its current main view
	this._callbacks		= {};	// view callbacks for when its state changes between hidden and shown
	this._viewApp		= {};	// hash matching view names to their owning apps
	this._isAppView		= {};	// names of top-level app views
	this._isTransient	= {};	// views we don't put on hidden stack
	this._toRemove		= [];	// views to remove from hidden on next view push

	this._isTabView		= {};	// views that open in tabs, rather than stacking
	this._tabParams		= {};	// params for app tab button
	this._viewByTabId	= {};	// view for the given tab

	this._components	= {};	// component objects (widgets)
	this._containers	= {};	// containers within the skin
	this._contBounds	= {};	// bounds for the containers

	// view pre-emption
	this._pushCallback = new AjxCallback(this, this.pushView);
	this._popCallback = new AjxCallback(this, this.popView);
	
	this._createLoadingView();
};

// components
ZmAppViewMgr.C_BANNER					= "banner";
ZmAppViewMgr.C_USER_INFO				= "userInfo";
ZmAppViewMgr.C_QUOTA_INFO				= "quota";
ZmAppViewMgr.C_OFFLINE_STATUS			= "offlineStatus";
ZmAppViewMgr.C_SEARCH					= "search";
ZmAppViewMgr.C_SEARCH_BUILDER			= "searchBuilder";
ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR	= "searchBuilderToolbar";
ZmAppViewMgr.C_APP_CHOOSER				= "appChooser";
ZmAppViewMgr.C_TREE						= "tree";
ZmAppViewMgr.C_TREE_FOOTER				= "treeFooter";
ZmAppViewMgr.C_TOOLBAR_TOP				= "topToolbar";
ZmAppViewMgr.C_TOOLBAR_BOTTOM			= "bottomToolbar";
ZmAppViewMgr.C_APP_CONTENT				= "main";
ZmAppViewMgr.C_APP_CONTENT_FULL			= "fullScreen";
ZmAppViewMgr.C_STATUS					= "status";
ZmAppViewMgr.C_SASH						= "sash";
ZmAppViewMgr.C_TASKBAR					= "taskbar";

ZmAppViewMgr.ALL_COMPONENTS = [
	ZmAppViewMgr.C_BANNER, ZmAppViewMgr.C_USER_INFO, ZmAppViewMgr.C_QUOTA_INFO,
	ZmAppViewMgr.C_OFFLINE_STATUS,
	ZmAppViewMgr.C_SEARCH, ZmAppViewMgr.C_SEARCH_BUILDER,
	ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR,
	ZmAppViewMgr.C_APP_CHOOSER, ZmAppViewMgr.C_TREE, ZmAppViewMgr.C_TREE_FOOTER,
	ZmAppViewMgr.C_TOOLBAR_TOP, ZmAppViewMgr.C_TOOLBAR_BOTTOM,
	ZmAppViewMgr.C_APP_CONTENT, ZmAppViewMgr.C_APP_CONTENT_FULL,
	ZmAppViewMgr.C_STATUS, ZmAppViewMgr.C_SASH, ZmAppViewMgr.C_TASKBAR
];

/**
 * These components are the ones that are NOT part of the app display when
 * in full screen mode.
 */
ZmAppViewMgr.APP_COMPONENTS = [
	ZmAppViewMgr.C_TREE, ZmAppViewMgr.C_TREE_FOOTER,
	ZmAppViewMgr.C_OFFLINE_STATUS, ZmAppViewMgr.C_STATUS,
	ZmAppViewMgr.C_SASH
];

// keys for getting container IDs
ZmAppViewMgr.CONT_ID_KEY = {};

// callbacks
ZmAppViewMgr.CB_PRE_HIDE	= 1;
ZmAppViewMgr.CB_POST_HIDE	= 2;
ZmAppViewMgr.CB_PRE_SHOW	= 3;
ZmAppViewMgr.CB_POST_SHOW	= 4;
ZmAppViewMgr.CB_PRE_UNLOAD	= 5;

// used to continue when returning from callbacks
ZmAppViewMgr.PENDING_VIEW = "ZmAppViewMgr.PENDING_VIEW";

ZmAppViewMgr.BROWSER_BACK		= "BACK";
ZmAppViewMgr.BROWSER_FORWARD	= "FORWARD";

ZmAppViewMgr._setContainerIds =
function() {
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_BANNER]					= ZmId.SKIN_LOGO;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_USER_INFO]				= ZmId.SKIN_USER_INFO;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_QUOTA_INFO]				= ZmId.SKIN_QUOTA_INFO;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_OFFLINE_STATUS]			= ZmId.SKIN_OFFLINE_STATUS;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_SEARCH]					= ZmId.SKIN_SEARCH;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_SEARCH_BUILDER]			= ZmId.SKIN_SEARCH_BUILDER;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR]	= ZmId.SKIN_SEARCH_BUILDER_TOOLBAR;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_APP_CHOOSER]			= ZmId.SKIN_APP_CHOOSER;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_TREE]					= ZmId.SKIN_TREE;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_TREE_FOOTER]			= ZmId.SKIN_TREE_FOOTER;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_TOOLBAR_TOP]			= ZmId.SKIN_APP_TOP_TOOLBAR;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_TOOLBAR_BOTTOM]			= ZmId.SKIN_APP_BOTTOM_TOOLBAR;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_APP_CONTENT]			= ZmId.SKIN_APP_MAIN;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_APP_CONTENT_FULL]		= ZmId.SKIN_APP_MAIN_FULL;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_STATUS]					= ZmId.SKIN_STATUS;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_SASH]					= ZmId.SKIN_SASH;
	ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_TASKBAR]				= ZmId.SKIN_TASKBAR;
};

// Public methods

ZmAppViewMgr.prototype.toString = 
function() {
	return "ZmAppViewMgr";
};

ZmAppViewMgr.prototype.isFullScreen =
function(viewId) {
	viewId = viewId || this._currentView;
	return Boolean(viewId && this._views[viewId] && this._views[viewId][ZmAppViewMgr.C_APP_CONTENT_FULL]);
};

/**
 * Registers the given components with the app view manager. This method should only be
 * called once for any given component.
 *
 * @param components	[hash]		a hash of component IDs and matching objects
 * @param doFit			[boolean]*	if true, go ahead and fit the components within their containers
 * @param noSetZ		[boolean]*	if true, do not set the z-index to VIEW
 */
ZmAppViewMgr.prototype.addComponents =
function(components, doFit, noSetZ) {
	var list = [];
	for (var cid in components) {
		var comp = components[cid];
		this._components[cid] = comp;
		if (this._hasSkin) {
			if (!this._containers[cid]) {
				var contId = ZmAppViewMgr.CONT_ID_KEY[cid];
				var contEl = document.getElementById(contId);
				// HACK: This allows full screen apps to place their content in
				//       the main app content area if the skin does not have a
				//       a container for the full screen app content.
				if (!contEl && cid == ZmAppViewMgr.C_APP_CONTENT_FULL) {
					contId = ZmAppViewMgr.CONT_ID_KEY[ZmAppViewMgr.C_APP_CONTENT];
					contEl = document.getElementById(contId);
				}
				if (!contEl) {
					// XXX: we no longer throw an exception b/c some skins want
					// to omit certain containers (i.e. quota).
					//throw new AjxException("Skin container '" + contId + "' not found.");
					DBG.println(AjxDebug.DBG1, "Skin container '" + contId + "' not found.");
					continue;
				}
				this._containers[cid] = contEl;
				if (doFit) {
					contEl.innerHTML = "";

					// if the container has bounds, fit the component to them now
					//	this prevents resize flash when laying out containers
					var bounds = this._getContainerBounds(cid);
					if (bounds) {
						comp.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
					}
				}
			}
			list.push(cid);
		}

		if (!noSetZ) {
			comp.zShow(true);
		}

		if (cid == ZmAppViewMgr.C_SASH) {
			if (this._sashSupported){
				comp.registerCallback(this._appTreeSashCallback, this);
			}
			comp.setCursor("default");
		}
	}
	if (doFit) {
		this._fitToContainer(list);
	}
};

/**
 * Replaces the component with the given ID with a new one.
 * 
 * @param cid		[constant]		component ID
 * @param component	[DwtControl]	new component
 */
ZmAppViewMgr.prototype.setComponent =
function(cid, component) {
	var comp = this._components[cid];
	if (comp) {
		comp.setLocation(Dwt.LOC_NOWHERE, Dwt.LOC_NOWHERE);
	}
	var components = {};
	components[cid] = component;
	this.addComponents(components, true);
};

/**
* Shows/hides the search builder.
*
* @param visible	if true, the search builder is shown
*/
ZmAppViewMgr.prototype.showSearchBuilder =
function(visible) {
	DBG.println(AjxDebug.DBG1, "show search builder: " + visible);
	skin.show("searchBuilder", visible);
	this._components[ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR].zShow(visible);
	this._components[ZmAppViewMgr.C_SEARCH_BUILDER].zShow(visible);
	var list = [
		ZmAppViewMgr.C_SEARCH_BUILDER, ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR,
		ZmAppViewMgr.C_APP_CHOOSER, ZmAppViewMgr.C_TREE,
		ZmAppViewMgr.C_TREE_FOOTER, ZmAppViewMgr.C_TOOLBAR_TOP,
		ZmAppViewMgr.C_APP_CONTENT, ZmAppViewMgr.C_APP_CONTENT_FULL
	];
	this._fitToContainer(list);
	// search builder contains forms, and browsers have quirks around form fields and z-index
	if (!visible) {
		this._components[ZmAppViewMgr.C_SEARCH_BUILDER].setLocation(Dwt.LOC_NOWHERE, Dwt.LOC_NOWHERE);
	}
};

/**
* Shows/hides the tree footer (mini-calendar).
*
* @param visible	if true, the tree footer is shown
*/
ZmAppViewMgr.prototype.showTreeFooter =
function(visible) {
	DBG.println(AjxDebug.DBG1, "show tree footer: " + visible);
	skin.show("treeFooter", visible);
	this._components[ZmAppViewMgr.C_TREE_FOOTER].zShow(visible && !this.isFullScreen());
	this._fitToContainer([ZmAppViewMgr.C_TREE, ZmAppViewMgr.C_TREE_FOOTER]);
};

/**
 * Performs settings-driven changes to the skin.
 */
ZmAppViewMgr.prototype.tweakSkin =
function() {
	// Hide the web search bar, expand regular one if web search explicitly disabled
	if (appCtxt.get(ZmSetting.WEB_SEARCH_ENABLED) === false) {
		var el = document.getElementById(ZmId.SKIN_WEB_SEARCH);
		if (el) {
			Dwt.setVisible(el, false);
		}
		el = document.getElementById(ZmId.SKIN_SPACING_SEARCH);
		if (el) {
			el.style.width = "100%";
		}
	}
};

/**
* Returns the ID of the app view currently being displayed.
*/
ZmAppViewMgr.prototype.getCurrentViewId =
function() {
	return this._currentView;
};

ZmAppViewMgr.prototype.getCurrentViewComponent = function(compId) {
	return this._components[compId];
};

/**
* Returns the ID of the app view last displayed.
*/
ZmAppViewMgr.prototype.getLastViewId =
function() {
	return this._lastView;
};

/**
* Returns the app view currently being displayed.
*/
ZmAppViewMgr.prototype.getCurrentView =
function() {
	var curView = this._views[this._currentView];
	return curView ? curView[ZmAppViewMgr.C_APP_CONTENT] || curView[ZmAppViewMgr.C_APP_CONTENT_FULL] : null;
};

/**
* Returns the current top-level view for the given app.
*
* @param app	the name of an app
*/
ZmAppViewMgr.prototype.getAppView =
function(app) {
	return this._appView[app];
};

/**
* Sets the current top-level view for the given app. Should be called by an app (or controller) that
* changes the top-level view of the app.
*
* @param app		the name of an app
* @param viewId		the ID of a view
*/
ZmAppViewMgr.prototype.setAppView =
function(app, viewId) {
	this._appView[app] = viewId;
};

/**
 * Registers a set of elements comprising an app view.
 *
 * @param params		[hash]			hash of params:
 *        viewId		the ID of the view
 *        appName		the name of the owning app
 *        elements		a hash of elements
 *        callbacks 	functions to call before/after this view is shown/hidden
 *        isAppView 	if true, this view is an app-level view
 *        isTransient	if true, this view does not go on the hidden stack
 *        tabParams		button params; view is opened in app tab instead of being stacked
 */
ZmAppViewMgr.prototype.createView =
function(params) {

	var viewId = params.viewId;
	DBG.println(AjxDebug.DBG1, "createView: " + viewId);

	this._views[viewId]			= params.elements;
	this._callbacks[viewId]		= params.callbacks || {};
	this._viewApp[viewId]		= params.appName;
	this._isAppView[viewId]		= params.isAppView;
	this._isTransient[viewId]	= params.isTransient;
	if (!this._isNewWindow && params.tabParams) {
		this._tabParams[viewId]	= params.tabParams;
		this._isTabView[viewId]	= Boolean(params.tabParams != null);
		this._viewByTabId[params.tabParams.id] = viewId;
	}
};

// XXX: should we have a destroyView() ?

/**
 * Makes the given view visible, pushing the previously visible one to the top of the
 * hidden stack.
 *
 * @param viewId		the ID of the app view to push
 * @param force			don't run callbacks
 * @param switchTab		if true, don't add tab button
 * @returns			true if the view was pushed (is now visible)
 */
ZmAppViewMgr.prototype.pushView =
function(viewId, force, switchTab) {

	if (switchTab) {
		viewId = this._viewByTabId[viewId];
	}
	
	var isPendingView = (viewId == ZmAppViewMgr.PENDING_VIEW);
	if (!isPendingView && !this._views[viewId]) {
		// view has not been created, bail
		return false;
	}

	var viewController;
	if (isPendingView) {
		viewId = this._pendingView;
		var view = this._views[viewId];
		if (view) {
			var appContent = view[ZmAppViewMgr.C_APP_CONTENT] || view[ZmAppViewMgr.C_APP_CONTENT_FULL];
			viewController = appContent.getController && appContent.getController();
		}
	}
	DBG.println(AjxDebug.DBG1, "pushView: " + viewId);

	// if same view, no need to hide previous view or check for callbacks
	if (viewId == this._currentView) {
		this._setViewVisible(viewId, true);
		// make sure the new content has focus
		if (viewController) {
			viewController._restoreFocus();
		}
		return true;
	}

	DBG.println(AjxDebug.DBG2, "hidden (before): " + this._hidden);

	if (this._isTabView[viewId]) {
		var tp = this._tabParams[viewId];
		if (tp && !switchTab) {
			appCtxt.getAppController().getAppChooser().addButton(tp.id, tp.label, tp.image, tp.tooltip);
		}
	}

	if (isPendingView) {
		DBG.println(AjxDebug.DBG1, "push of pending view: " + this._pendingView);
		force = true;
	}

	if (!this._hideView(this._currentView, force || this._isTabView[this._currentView])) {
		this._pendingAction = this._pushCallback;
		this._pendingView = viewId;
		return false;
	}
	this.addComponents(this._views[viewId]);
	if (this._currentView && (this._currentView != viewId) && !this._isTransient[this._currentView]) {
		this._hidden.push(this._currentView);
	}

	this._removeFromHidden(viewId);
	var temp = this._lastView;
	this._lastView = this._currentView;
	this._currentView = viewId;
	DBG.println(AjxDebug.DBG2, "app view mgr: current view is now " + this._currentView);

	if (!this._showView(viewId, force, (viewId != this._currentView))) {
		this._currentView = this._lastView;
		this._lastView = temp;
		this._pendingAction = this._pushCallback;
		this._pendingView = viewId;
		return false;
	}
	DBG.println(AjxDebug.DBG2, "hidden (after): " + this._hidden);

	// a view is being pushed - add it to browser history stack unless we're
	// calling this function as a result of browser Back or Forward
	if (this._noHistory) {
		DBG.println(AjxDebug.DBG2, "noHistory: push " + viewId);
		this._noHistory = false;
	} else {
		if (viewId != ZmId.VIEW_LOADING) {
			this._nextHashIndex++;
			this._curHashIndex = this._nextHashIndex;
			this._hashView[this._curHashIndex] = viewId;
			DBG.println(AjxDebug.DBG2, "adding to browser history: " + this._curHashIndex + "(" + viewId + ")");
			if (this._historyMgr) {
				this._historyMgr.add(this._curHashIndex);
			}
		}
	}

	this._layout(this._currentView);


	if (viewController && viewController.setCurrentView) {
		viewController.setCurrentView(viewId);
	}
	if (this._isAppView[viewId]) {
		this.setAppView(this._viewApp[viewId], viewId);
	}
	
	if (this._toRemove.length) {
		for (var i = 0; i < this._toRemove.length; i++) {
			this._removeFromHidden(this._toRemove[i]);
		}
		this._toRemove = [];
	}

	return true;
};

/**
* Hides the currently visible view, and makes the view on top of the hidden stack visible.
*
* @param	force	[Boolean]		don't run callbacks (which check if popping is OK)
* @param	viewId	[Integer]		only pop if this is current view
* @returns			[Boolean]		true if the view was popped
*/
ZmAppViewMgr.prototype.popView =
function(force, viewId) {
	if (!this._currentView) {
		DBG.println(AjxDebug.DBG1, "ERROR: no view to pop");
		return false;
	}

	var isPendingView = (force == ZmAppViewMgr.PENDING_VIEW);
	if (isPendingView) {
		viewId = force;
		force = true;
	}

	// check if trying to pop non-current view
	if (viewId && !isPendingView && (this.getCurrentViewId() != viewId)) { return false; }

	if (!this._hidden.length && !this._isNewWindow) {
		DBG.println(AjxDebug.DBG1, "ERROR: no view to replace popped view");
		// bug fix #11264 - if logged in w/ view=compose, popView should reload mail app
		if (location && (location.search.match(/\bview=compose\b/))) {
			this._controller.activateApp(ZmApp.MAIL);
		}
		return false;
	}

	DBG.println(AjxDebug.DBG1, "popView: " + this._currentView);
	DBG.println(AjxDebug.DBG2, "hidden (before): " + this._hidden);
	if (!this._hideView(this._currentView, force)) {
		this._pendingAction = this._popCallback;
		this._pendingView = null;
		return false;
	}
	this._deactivateView(this._views[this._currentView]);

	if (this._isTabView[this._currentView]) {
		var buttonId = this._tabParams[this._currentView].id;
		var button = appCtxt.getAppController().getAppChooser().getButton(buttonId);
		if (button) {
			button.dispose();
		}
	}

	this._lastView = this._currentView;
	this._currentView = this._hidden.pop();

	// close this window if no more views exist and it's a child window
	if (!this._currentView && this._isNewWindow) {
		window.close();
		return false;
	}

	DBG.println(AjxDebug.DBG2, "app view mgr: current view is now " + this._currentView);
	if (!this._showView(this._currentView, this._popCallback, null, force, true)) {
		DBG.println(AjxDebug.DBG1, "ERROR: pop with no view to show");
		return false;
	}
	this._removeFromHidden(this._currentView);
	DBG.println(AjxDebug.DBG2, "hidden (after): " + this._hidden);
	DBG.println(AjxDebug.DBG2, "hidden (" + this._hidden.length + " after pop): " + this._hidden);

	// Move one back in the browser history stack so that we stay in sync, unless
	// we're calling this function as a result of browser Back
	if (this._historyMgr) {
		if (this._noHistory) {
			DBG.println(AjxDebug.DBG2, "noHistory (pop)");
			this._noHistory = false;
		} else {
			this._ignoreHistoryChange = true;
			history.back();
		}
	}

	this.addComponents(this._views[this._currentView]);
	this._layout(this._currentView);

	return true;
};

/**
 * Makes the given view visible, and clears the hidden stack.
 *
 * @param 		viewId		the ID of the view
 * @param 		force		ignore pre-emption callbacks
 * @returns					true if the view was set
 */
ZmAppViewMgr.prototype.setView =
function(viewId, force) {
	DBG.println(AjxDebug.DBG1, "setView: " + viewId);
	var result = this.pushView(viewId, force);
	if (result) {
		for (var i = 0; i < this._hidden.length; i++) {
			var view = this._views[this._hidden[i]];
			this._deactivateView(view);
		}
		this._hidden = [];
	}
	return result;
};

/**
 * Moves the given view to the top of the hidden stack, so that it will
 * appear when the current view is popped.
 * 
 * @param viewId		the ID of the view
 */
ZmAppViewMgr.prototype.stageView =
function(viewId) {
	DBG.println(AjxDebug.DBG1, "stageView: " + viewId);
	this._removeFromHidden(viewId);
	this._hidden.push(viewId);
};

/**
 * Swaps in one view's components for another. Intended for use by a tab that shows more
 * than one view (eg going from compose to mail confirm view), so that we don't have to
 * manage stacking within a tab.
 * 
 * @param oldViewId
 * @param newViewId
 */
ZmAppViewMgr.prototype.replaceView =
function(oldViewId, newViewId) {
	var oldView = this._views[oldViewId];
	var newView = this._views[newViewId];
	this._hideView(oldViewId, true);
	for (var cid in newView) {
		oldView[cid] = newView[cid];
	}
	if (this._currentView == oldViewId) {
		this._currentView = newViewId;
		this._showView(newViewId);
		this._layout(this._currentView);
	}
};

ZmAppViewMgr.prototype.isAppView = 
function(viewId) {
	return this._isAppView[viewId];
};

/**
* Shows the view that was waiting for return from a popped view's callback. Typically, the
* popped view's callback will have put up some sort of dialog, and this function would be
* called by a listener on a dialog button.
*
* @param show		whether to show the pending view
*/
ZmAppViewMgr.prototype.showPendingView =
function(show) {
	if (show && this._pendingAction) {
		this._pendingAction.run(ZmAppViewMgr.PENDING_VIEW);
	}

	// If a pop shield has been dismissed and we're not going to show the
	// pending view, and we got here via press of browser Back/Forward button,
	// then undo that button press so that the browser history is correct.
	if (!show) {
		if (this._browserAction == ZmAppViewMgr.BROWSER_BACK) {
			this._ignoreHistoryChange = true;
			history.forward();
		} else if (this._browserAction == ZmAppViewMgr.BROWSER_FORWARD) {
			this._ignoreHistoryChange = true;
			history.back();
		}
		this._browserAction = null;
	}
	this._pendingAction = this._pendingView = null;
};

ZmAppViewMgr.prototype.fitAll =
function(resetToolbar) {
	this._fitToContainer(ZmAppViewMgr.ALL_COMPONENTS, resetToolbar);
};

/**
* Returns the currently pending view waiting to get pushed
*/
ZmAppViewMgr.prototype.getPendingViewId = 
function() {
	return this._pendingView;
};

/**
* Destructor for this object.
*/
ZmAppViewMgr.prototype.reset = 
function() {
	this._shell.removeControlListener(this._controlListener);
	for (var i in this._views) {
		var elements = this._views[i];
		for (var j = 0; j < elements.length; j++) {
			for (var cid in elements[j]) {
				this._components[cid].dispose();
				this._components[cid] = null;
				this._containers[cid] = null;
			}
		}
	}
};

/**
* Shows the current view's title in the title bar.
*/
ZmAppViewMgr.prototype.updateTitle = 
function() {
	this._setTitle(this._currentView);
};

/**
* Checks if it is ok to log off.
* 
* @param 	pendingAction		action to perform if the user allows logout
*/
ZmAppViewMgr.prototype.isOkToLogOff =
function(pendingAction) {
	var okToContinue = true;
	var callback = this._callbacks[this._currentView] ? this._callbacks[this._currentView][ZmAppViewMgr.CB_PRE_HIDE] : null;
	if (callback) {
		DBG.println(AjxDebug.DBG2, "checking if ok to log off " + this._currentView);
		this._pendingAction = pendingAction;
		this._pendingView = null;
		okToContinue = callback.run(this._currentView, false);
	}
	return okToContinue;
};

/**
* Checks if it is ok to unload the app (user navigtates away, closes browser, etc.)
*/
ZmAppViewMgr.prototype.isOkToUnload =
function() {
	var okToContinue = true;
	var callback = this._callbacks[this._currentView] ? this._callbacks[this._currentView][ZmAppViewMgr.CB_PRE_UNLOAD] : null;
	if (callback) {
		DBG.println(AjxDebug.DBG2, "checking if ok to unload " + this._currentView);
		okToContinue = callback.run(this._currentView);
	}
	return okToContinue;
};

// Private methods

ZmAppViewMgr.prototype._createLoadingView =
function() {
	var loadingView = new DwtControl({parent:this._shell, className:"DwtListView",
									  posStyle:Dwt.ABSOLUTE_STYLE, id:ZmId.LOADING_VIEW});
	var el = loadingView.getHtmlElement();
	el.innerHTML = AjxTemplate.expand("share.App#Loading", this._htmlElId);
	var elements = {};
	elements[ZmAppViewMgr.C_APP_CONTENT] = loadingView;
	this.createView({viewId:ZmId.VIEW_LOADING, elements:elements});
};

// Locates and sizes the given list of components to fit within their containers.
ZmAppViewMgr.prototype._fitToContainer =
function(components, resetToolbar) {
	for (var i = 0; i < components.length; i++) {
		var cid = components[i];
		DBG.println(AjxDebug.DBG3, "fitting to container: " + cid);
		var cont = this._containers[cid];
		if (cont) {
			var comp = this._components[cid];
			if (comp && (comp.getZIndex() != Dwt.Z_HIDDEN)) {
				var position = this._getComponentPosition(cid);
				var isStatic = (position == Dwt.STATIC_STYLE);
				
				// reset position if skin overrides default of absolute
				var compEl = comp.getHtmlElement();
				if (position) {
					compEl.style.position = position;
				}

				if (isStatic) {
					if (compEl.parentNode != cont) {
						cont.appendChild(compEl);
					}
				} else {
					var contBds = Dwt.getBounds(cont);
					// take insets (border + padding) into account
					var insets = Dwt.getInsets(cont);
					Dwt.insetBounds(contBds, insets);
					
					// save bounds
					this._contBounds[cid] = contBds;
					comp.setBounds(contBds.x, contBds.y, contBds.width, contBds.height);
				}

				if (cid == ZmAppViewMgr.C_TOOLBAR_TOP ||
					cid == ZmAppViewMgr.C_APP_CHOOSER)
				{
					// fit toolbars according to resolution
					this.fitAppToolbar(resetToolbar);
				}
			}
		}
	}

	if (window.DBG && DBG.getDebugLevel() >= AjxDebug.DBG2) {
		this._debugShowMetrics(components);
	}
};

ZmAppViewMgr.prototype._getComponentPosition =
function(cid) {
	return appCtxt.getSkinHint(cid, "position");
};

ZmAppViewMgr.prototype._getContainerBounds =
function(cid) {
	// ignore bounds for statically laid-out components
	var position = this._getComponentPosition(cid);
	if (position == Dwt.STATIC_STYLE) return null;

	var container = this._containers[cid];
	if (container) {
		var bounds = Dwt.getBounds(container);
		// take insets (border + padding) into account
		var insets = Dwt.getInsets(container);
		Dwt.insetBounds(bounds, insets);
		return bounds;
	}
	return null;
};

// Performs manual layout of the components, absent a containing skin. Currently assumes
// that there will be a top toolbar and app content.
ZmAppViewMgr.prototype._layout =
function(view) {
	// if skin, elements already laid out by being placed in their containers
	if (this._hasSkin) { return; }
	
	var topToolbar = this._components[ZmAppViewMgr.C_TOOLBAR_TOP];
	var sz = topToolbar.getSize();
	var height = sz.y ? sz.y : topToolbar.getHtmlElement().clientHeight;
	topToolbar.setBounds(0, 0, this._shellSz.x, height);
	var appContent = this._components[ZmAppViewMgr.C_APP_CONTENT] || this._components[ZmAppViewMgr.C_APP_CONTENT_FULL];
	appContent.setBounds(0, height, this._shellSz.x, this._shellSz.y - height);
};

// Tries to hide the given view. First checks to see if the view has a callback
// for when it is hidden. The callback must return true for the view to be hidden.
ZmAppViewMgr.prototype._hideView =
function(view, force) {
	if (!view) return true;
	var okToContinue = true;
	var callback = this._callbacks[view] ? this._callbacks[view][ZmAppViewMgr.CB_PRE_HIDE] : null;
	if (callback) {
		DBG.println(AjxDebug.DBG2, "hiding " + view);
		okToContinue = callback.run(view, force);
	}
	if (okToContinue) {
		this._setViewVisible(view, false);
		DBG.println(AjxDebug.DBG2, view + " hidden");
		callback = this._callbacks[view] ? this._callbacks[view][ZmAppViewMgr.CB_POST_HIDE] : null;
		if (callback) {
			callback.run(view);
		}
	}

	return okToContinue;
};

// Makes the given view visible.
ZmAppViewMgr.prototype._showView =
function(view, force, isNewView) {
	var okToContinue = true;
	var callback = this._callbacks[view] ? this._callbacks[view][ZmAppViewMgr.CB_PRE_SHOW] : null;
	if (callback) {
		DBG.println(AjxDebug.DBG2, "showing " + view);
		okToContinue = callback.run(view, isNewView, force);
	}
	if (okToContinue) {
		this._setViewVisible(view, true);
		DBG.println(AjxDebug.DBG2, view + " shown");
		callback = this._callbacks[view] ? this._callbacks[view][ZmAppViewMgr.CB_POST_SHOW] : null;
		if (callback) {
			callback.run(view, isNewView);
		}
	}

	if (!this._isNewWindow && appCtxt.zimletsPresent()) {
		appCtxt.getZimletMgr().notifyZimlets("onShowView", [view, isNewView]);
	}

	return okToContinue;
};

// Makes elements visible/hidden by locating them off- or onscreen and setting
// their z-index.
ZmAppViewMgr.prototype._setViewVisible =
function(view, show) {
	var elements = this._views[view];
	var wasFull = this._lastView ? this.isFullScreen(this._lastView) : null;
	var isFull = this.isFullScreen(view);
	if (show) {
		if (wasFull !== isFull) {
			if (this._hasSkin) {
				skin.show("fullScreen", isFull);
			}

			for (var i = 0; i < ZmAppViewMgr.APP_COMPONENTS.length; i++) {
				var cid = ZmAppViewMgr.APP_COMPONENTS[i];
				var comp = this._components[cid];
				if (!comp) continue;
				comp.zShow(!isFull);
				if (isFull) {
					try {
						comp.setLocation(Dwt.LOC_NOWHERE, Dwt.LOC_NOWHERE);
					}
					catch (e) {
						// ignore 
					}
				}
			}
			if (!isFull && this._hasSkin) {
				this._fitToContainer(ZmAppViewMgr.APP_COMPONENTS);
			}
		}
		var list = [];
		for (var cid in elements) {
			list.push(cid);
			elements[cid].zShow(true);
			this._components[cid] = elements[cid];
		}
		if (this._hasSkin) {
			this._fitToContainer(list);
		}
		this._setTitle(view);
		if (this._isTabView[view]) {
			var tabId = this._tabParams[view].id;
			this._controller.setActiveTabId(tabId);
		} else if (this._viewApp[view]) {
			this._controller.setActiveApp(this._viewApp[view], view);
		}
	} else {
		for (var cid in elements) {
			DBG.println(AjxDebug.DBG2, "hiding " + cid + " for view " + view);
			elements[cid].setLocation(Dwt.LOC_NOWHERE, Dwt.LOC_NOWHERE);
			elements[cid].zShow(false);
		}
	}
};

// Removes a view from the hidden stack.
ZmAppViewMgr.prototype._removeFromHidden =
function(view) {
	var newHidden = [];
	for (var i = 0; i < this._hidden.length; i++) {
		if (this._hidden[i] != view) {
			newHidden.push(this._hidden[i]);
		}
	}
	this._hidden = newHidden;
};

// Tells a view that it has been hidden.
ZmAppViewMgr.prototype._deactivateView =
function(viewId) {
	var view = this._views[viewId];
	for (var cid in view) {
		var comp = view[cid];
		if (comp.deactivate) {
			comp.deactivate();
		}
	}
};

ZmAppViewMgr.prototype._setTitle =
function(view) {
	var elements = this._views[view];
	if (!elements) {
		DBG.println(AjxDebug.DBG1, "No elements found for view " + view);
		return;
	}
	var content = elements[ZmAppViewMgr.C_APP_CONTENT] || elements[ZmAppViewMgr.C_APP_CONTENT_FULL];
	if (content && content.getTitle) {
		var title = content.getTitle();
		Dwt.setTitle(title ? title : ZmMsg.zimbraTitle);
	}
};

// Listeners

// Handles shell resizing event.
ZmAppViewMgr.prototype._shellControlListener =
function(ev) {
	if (ev.oldWidth != ev.newWidth || ev.oldHeight != ev.newHeight) {

		this._shellSz.x = ev.newWidth;
		this._shellSz.y = ev.newHeight;
		var deltaWidth = ev.newWidth - ev.oldWidth;
		var deltaHeight = ev.newHeight - ev.oldHeight;
		DBG.println(AjxDebug.DBG1, "shell control event: dW = " + deltaWidth + ", dH = " + deltaHeight);
		if (this._isNewWindow) {
			// reset width of top toolbar
			var topToolbar = this._views[this._currentView][ZmAppViewMgr.C_TOOLBAR_TOP];
			if (topToolbar) {
				topToolbar.setSize(ev.newWidth, Dwt.DEFAULT);
			}
			// make sure to remove height of top toolbar for height of app content
			var view = this._views[this._currentView];
			var appContent = view[ZmAppViewMgr.C_APP_CONTENT] || view[ZmAppViewMgr.C_APP_CONTENT_FULL];
			if (appContent) {
				appContent.setSize(ev.newWidth, ev.newHeight - topToolbar.getH());
			}
		} else {
			if (deltaHeight && deltaWidth) {
				this.fitAll(true);
			} else if (deltaHeight) {
				var list = [
					ZmAppViewMgr.C_APP_CHOOSER, ZmAppViewMgr.C_TREE, ZmAppViewMgr.C_TREE_FOOTER,
					ZmAppViewMgr.C_SASH, ZmAppViewMgr.C_APP_CONTENT, ZmAppViewMgr.C_APP_CONTENT_FULL,
					ZmAppViewMgr.C_STATUS, ZmAppViewMgr.C_TASKBAR
				];
				this._fitToContainer(list, true);
			} else if (deltaWidth) {
				var list = [
					ZmAppViewMgr.C_BANNER, ZmAppViewMgr.C_SEARCH, ZmAppViewMgr.C_USER_INFO, ZmAppViewMgr.C_QUOTA_INFO,
					ZmAppViewMgr.C_OFFLINE_STATUS,
					ZmAppViewMgr.C_SEARCH_BUILDER, ZmAppViewMgr.C_SEARCH_BUILDER_TOOLBAR,
					ZmAppViewMgr.C_TOOLBAR_TOP, ZmAppViewMgr.C_APP_CONTENT, ZmAppViewMgr.C_APP_CONTENT_FULL,
					ZmAppViewMgr.C_TOOLBAR_BOTTOM, ZmAppViewMgr.C_TASKBAR
				];
				this._fitToContainer(list, true);
			}
		}
	}
};

ZmAppViewMgr.prototype.fitAppToolbar =
function(resetToolbar) {
	// Assuming every view has a toolbar.
	var toolbar = this._views[this._currentView] && this._views[this._currentView][ZmAppViewMgr.C_TOOLBAR_TOP];

	if (toolbar && toolbar.autoAdjustWidth) {
		toolbar.autoAdjustWidth(this._containers[ZmAppViewMgr.C_TOOLBAR_TOP], resetToolbar);
	}

	var appChooser = appCtxt.getAppController().getAppChooser();
	if (appChooser && AjxEnv.is800x600orLower) {
		appChooser.autoAdjustWidth(this._containers[ZmAppViewMgr.C_TOOLBAR_TOP]);
	}
};

ZmAppViewMgr.prototype._debugShowMetrics =
function(components) {
	for (var i = 0; i < components.length; i++) {
		var cid = components[i];
		var cont = this._containers[cid];
		if (cont) {
			var contBds = Dwt.getBounds(cont);
			DBG.println("Container bounds for " + cid + ": " + contBds.x + ", " + contBds.y + " | " + contBds.width + " x " + contBds.height);
		}
	}
};

/**
 * Handles browser Back/Forward. We compare the new index to our current one
 * to see if the user has gone back or forward. If back, we pop the view,
 * otherwise we push the appropriate view.
 * 
 * @param ev	[AjxEvent]		history event
 */
ZmAppViewMgr.prototype._historyChangeListener =
function(ev) {
	if (!(ev && ev.data)) { return; }
	if (this._ignoreHistoryChange) {
		this._ignoreHistoryChange = false;
		return;
	}

	var dlg = DwtBaseDialog.getActiveDialog();
	if (dlg && dlg.isPoppedUp()) {
		dlg.popdown();
	}

	var hashIndex = parseInt(ev.data);
	this._noHistory = true;
	var viewId = this._hashView[hashIndex];
	if (hashIndex == (this._curHashIndex - 1)) {
		// Back button has been pressed
		this._browserAction = ZmAppViewMgr.BROWSER_BACK;
		this.popView();
	} else if (hashIndex == (this._curHashIndex + 1)) {
		// Forward button has been pressed
		this._browserAction = ZmAppViewMgr.BROWSER_FORWARD;
		this.pushView(viewId);
	} else {
		// Not sure where we are - just push the correct view
		this._browserAction = null;
		this.pushView(viewId);
	}
	this._curHashIndex = hashIndex;

	DBG.println(AjxDebug.DBG2, "History change to " + hashIndex + ", new view: " + viewId);
};

// Handles app/tree movement. If you move the sash beyond the max or min width,
// pins to the respective width.
ZmAppViewMgr.prototype._appTreeSashCallback =
function(delta) {
	if (!window.skin) { return; }

	// ask skin for width of tree, rather than hard-coding name of tree div here
	var currentWidth = skin.getTreeWidth();
	if (!currentWidth) { return 0; }

	DBG.println(AjxDebug.DBG3, "************ sash callback **************");
	DBG.println(AjxDebug.DBG3, "delta = " + delta);
	DBG.println(AjxDebug.DBG3, "shell width = " + this._shellSz.x);
	DBG.println(AjxDebug.DBG3, "current width = " + currentWidth);

	// MOW: get the min/max sizes from the skin.hints
	if (!this.treeMinSize) {
		this.treeMinSize = window.skin.hints.tree.minWidth || 150;
		this.treeMaxSize = window.skin.hints.tree.maxWidth || 300;
	}

	// pin the resize to the minimum and maximum allowable
	if (currentWidth + delta > this.treeMaxSize) {
		delta = Math.max(0, this.treeMaxSize - currentWidth);
	}
	if (currentWidth + delta < this.treeMinSize) {
		delta = Math.min(0, this.treeMinSize - currentWidth);
	}

	// tell skin to resize the tree to keep the separation of tree/skin clean
	var newTreeWidth = currentWidth + delta;

	skin.setTreeWidth(newTreeWidth);

	// call fitAll() on timeout, so we dont get into a problem w/ sash movement code
	var me = this;
	setTimeout(function(){me.fitAll(true)},0);
	return delta;
};
