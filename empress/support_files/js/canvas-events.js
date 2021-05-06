define(["underscore", "glMatrix", "SelectedNodeMenu"], function (
    _,
    gl,
    SelectedNodeMenu
) {
    /**
     * @class CanvasEvents
     *
     * Handles the tree canvas events. These events include all tree movement
     * events as well as quick search events.
     *
     * @param {Empress} empress The core class. Entry point for all metadata and
     *                  tree operations.
     */
    function CanvasEvents(empress) {
        this.empress = empress;
        this.drawer = empress._drawer;
        this.canvas = empress._canvas;

        // the current mouse coordinates in screen space
        this.mouseX = null;
        this.mouseY = null;

        /*
         * This flag is set when the last event cause the tree move in the xy
         * plane.
         *
         * if this flag is not set when user clicks on canvas, then the
         * selected node menu will be reset. Otherwise, if this flag is set,
         * the selected node menu's location will be updated to follow its
         * respective node.
         */
        this.mouseMove = false;
        this.selectedNodeMenu = new SelectedNodeMenu(this.empress, this.drawer);

        // the quick search bar
        this.quickSearchBar = document.getElementById("quick-search");

        // quick-search button
        this.quickSearchBtn = document.getElementById("side-header-search-btn");

        // The div container that holds the quick search bar.
        // Autocomplete options will also be added to the end of this container
        this.autocompleteContainer = document.getElementById(
            "autocomplete-container"
        );
    }

    /**
     * Creates the mouse events to handle moving/zooming the tree
     *
     * modified from
     * https://www.w3schools.com/howto/howto_js_draggable.asp
     */
    CanvasEvents.prototype.setMouseEvents = function () {
        // need for use in closures
        var scope = this;
        var canvas = this.canvas;
        var drawer = this.drawer;
        var empress = this.empress;
        var selectedNodeMenu = this.selectedNodeMenu;
        var newX = 0,
            newY = 0;

        // moves tree as long as mouse is pressed down
        var moveTree = function (e) {
            // set move flag
            scope.mouseMove = true;

            // grab mouse location
            var center = canvas.offsetWidth / 2;
            newX = e.clientX - center;
            newY = center - e.clientY;

            // find how far mouse move in tree space
            var curTreeCoords = gl.vec4.fromValues(
                scope.mouseX,
                scope.mouseY,
                0,
                1
            );
            var newTreeCoords = gl.vec4.fromValues(newX, newY, 0, 1);
            var transVec = gl.vec4.create();
            gl.vec4.sub(transVec, newTreeCoords, curTreeCoords);

            // create translation matrix
            var transMat = gl.mat4.create();
            gl.mat4.fromTranslation(transMat, transVec);
            gl.mat4.multiply(drawer.worldMat, transMat, drawer.worldMat);

            // update current mouse position
            scope.mouseX = newX;
            scope.mouseY = newY;

            // draw tree
            drawer.draw();

            // update the node selection menu
            selectedNodeMenu.updateMenuPosition();
        };

        // stops moving tree when mouse is released
        var stopMove = function (e) {
            document.onmouseup = null;
            document.onmousemove = null;
            scope.mouseX = null;
            scope.mouseY = null;
            canvas.style.cursor = "default";
        };

        // adds the listeners to the document to move tree
        var mouseDown = function (e) {
            scope.mouseMove = false;
            var center = canvas.offsetWidth / 2;
            scope.mouseX = e.clientX - center;
            scope.mouseY = center - e.clientY;
            document.onmouseup = stopMove;
            document.onmousemove = moveTree;
            canvas.style.cursor = "none";
        };

        // zooms the tree in/out
        var zoomTree = function (e) {
            // find position of cursor before zoom. This allows the zoom to
            // occur at cursor rather than at origin
            var center = canvas.offsetWidth / 2;
            var mX = e.clientX - center;
            var mY = center - e.clientY;

            // zoom tree centered at curPos
            drawer.zoom(mX, mY, e.deltaY < 0);
            drawer.draw();

            // update the node selection menu
            selectedNodeMenu.updateMenuPosition();
        };

        // removes the selected node menu if the mouseMove flag is not set
        var mouseClick = function (e) {
            if (!scope.mouseMove) {
                // clear old select menu
                selectedNodeMenu.clearSelectedNode();

                var treeSpace = drawer.toTreeCoords(e.clientX, e.clientY);
                var x = treeSpace.x;
                var y = treeSpace.y;

                // If the clicked point is within the barplot area, show a menu
                // for the corresponding tip node.
                if (empress.isPointWithinBarplotRange(x, y)) {
                    var tipKey = scope.empress.getTipByBarplotClickPoint(x, y);
                    scope.placeBarplotNodeSelectionMenu(tipKey, x, y);
                    return;
                }

                // check if mouse is in a clade
                var clade = empress.getRootNodeForPointInClade([x, y]);
                if (clade !== -1) {
                    scope.placeNodeSelectionMenu(
                        scope.empress.getName(clade),
                        false,
                        clade
                    );
                    return;
                }

                // margin of error for mouse click to still register a node sel
                var epsilon = 10;
                var closestDist = Infinity;
                var closeNode = null;
                var xDist, yDist;

                // Go through all the nodes in the tree and find the node
                // closest to the (x, y) point that was clicked
                for (var node = 1; node <= empress._tree.size; node++) {
                    if (!empress.getNodeInfo(node, "visible")) continue;
                    var nodeX = empress.getX(node);
                    var nodeY = empress.getY(node);
                    xDist = x - nodeX;
                    yDist = y - nodeY;
                    var squareDist = xDist * xDist + yDist * yDist;
                    if (squareDist < closestDist) {
                        closestDist = squareDist;
                        closeNode = node;
                    }
                }

                // check if the closest-to-the-click node is within epsilon
                // pixels away from the mouse click; if so, this node was
                // "selected," so we can open the menu
                var nX = empress.getX(closeNode);
                var nY = empress.getY(closeNode);
                var screenSpace = drawer.toScreenSpace(nX, nY);
                nX = screenSpace.x;
                nY = screenSpace.y;
                xDist = e.clientX - nX;
                yDist = e.clientY - nY;
                var screenDist = Math.sqrt(xDist * xDist + yDist * yDist);
                if (screenDist < epsilon) {
                    // We pass closeNode so that placeNodeSelectionMenu()
                    // knows which node was selected, even if the selected node
                    // has a duplicate name.
                    // (Not all places that call this function will know this
                    // information, though -- for example, the searching code
                    // only knows the name of the node the user specified. This
                    // is why we still have to provide the name here.)
                    scope.placeNodeSelectionMenu(
                        empress.getNodeInfo(closeNode, "name"),
                        false,
                        closeNode
                    );
                }
            }
        };

        // uncollapses a clade if double clicked on
        var doubleClick = function (e) {
            var treeSpace = drawer.toTreeCoords(e.clientX, e.clientY);
            var x = treeSpace.x;
            var y = treeSpace.y;

            var clade = empress.getRootNodeForPointInClade([x, y]);
            if (clade === -1) {
                return;
            }
            empress.dontCollapseClade(clade);
        };

        canvas.onmousedown = mouseDown;
        canvas.onclick = mouseClick;
        canvas.onwheel = zoomTree;
        canvas.ondblclick = doubleClick;
    };

    /**
     * Creates an autocomplete menu for possible node ids as the user types
     * in the quick-search bar
     *
     * @param{Array} ids A list of node ids. Note: ids should only contain the
     *                   user defined ids and not the ones generated by Empress
     *
     * modified from https://www.w3schools.com/howto/howto_js_autocomplete.asp
     */
    CanvasEvents.prototype.autocomplete = function (ids) {
        // need for use in closures
        var autocompleteContainer = this.autocompleteContainer;
        var quickSearchBar = this.quickSearchBar;
        var scope = this;
        var searchBtn = this.quickSearchBtn;

        var createClickEvent = function (e) {
            var nodeName = this.id;

            // set text of quick-search to match suggested word
            quickSearchBar.value = nodeName;
            quickSearchBar.innerHTML = nodeName;

            // show the selected node menu
            scope.placeNodeSelectionMenu(nodeName, true);

            // clear possible words menu
            removeSuggestionMenu();
        };

        /**
         * oninput event for quickSearchBar
         * This function will add all nodesto the suggested node id menu that
         * begin with the users query as they type into the quick-search bar.
         * As long as quickSearchBar has focus, this function is called on every
         * time the quick-search query is updated (i.e. pretty much every
         * keystroke)
         *
         * Note: 'this' refers to quickSearchBar
         */
        var addSuggestions = function () {
            // remove old suggestions
            removeSuggestionMenu();

            // grab the quick-search query
            var query = this.value;

            // if quick search bar is empty then do nothing
            if (!query) {
                return;
            }

            // create container for the possible nodes ids
            var suggestionMenu = document.createElement("DIV");
            suggestionMenu.setAttribute("id", "autocomplete-list");
            suggestionMenu.setAttribute("class", "autocomplete-items");
            suggestionMenu.setAttribute(
                "style",
                "width:" + this.offsetWidth + "px;"
            );
            autocompleteContainer.appendChild(suggestionMenu);

            // helper function to compare query to node name
            // returns true if the first (query.length) characters of nodeName
            // are equal to query, ignoring case (if query.length >
            // nodeName.length this should be false, since .substr()
            // will just not modify the nodeName)
            var compareQuery = function (nodeName) {
                return (
                    nodeName.substr(0, query.length).toUpperCase() ===
                    query.toUpperCase()
                );
            };

            // search ids array for all possible words
            var suggestId,
                word,
                i = 0,
                suggestedWords = [];

            for (i; i < ids.length && suggestedWords.length < 10; i++) {
                word = ids[i];

                // if node id begins with user query, add it to suggestionMenu
                if (compareQuery(word) && !_.contains(suggestedWords, word)) {
                    suggestedWords.push(word);
                }
            }

            suggestedWords.sort(function (a, b) {
                return a.localeCompare(b, "en", { sensitivity: "base" });
            });
            for (var suggestion in suggestedWords) {
                // create a container to hold the text/click event for the
                // suggested id
                word = suggestedWords[suggestion];
                suggestId = document.createElement("DIV");
                suggestId.id = word;

                suggestId.innerHTML =
                    "<strong>" + word.substr(0, query.length) + "</strong>";
                suggestId.innerHTML += word.substr(query.length);

                // add click event so user can select id from menu
                suggestId.addEventListener("mousedown", createClickEvent);

                // add suggested id to the suggstions menu
                suggestionMenu.appendChild(suggestId);
            }

            // not all node ids were listed in the autofill box
            // create an ellipse autofill (...) to let users know there are
            // more possible options
            if (i < ids.length) {
                suggestId = document.createElement("DIV");

                suggestId.innerHTML = "<strong>...</strong>";
                suggestionMenu.appendChild(suggestId);
            }
        };

        /**
         * onkeydown event for quickSearchBar
         * This function will display the selected node menu for the node id
         * in the quick-search bar whenever the user presses the <ENTER> key.
         * Note: 'this' refers to quickSearchBar
         *
         * @param{Object} key The key the user pressed
         */
        var searchId = function (key) {
            // <ENTER> key is pressed
            if (key.keyCode === 13) {
                removeSuggestionMenu();
                scope.placeNodeSelectionMenu(this.value, true);
            }
        };

        /**
         * onblur event for quickSearchBar and is also called from other events
         * Removes the suggestionMenu
         * Note: 'this' refers to quickSearchBar
         */
        var removeSuggestionMenu = function () {
            var suggestionMenu = document.getElementById("autocomplete-list");
            quickSearchBar.classList.remove("invalid-search");
            if (suggestionMenu) {
                autocompleteContainer.removeChild(suggestionMenu);
            }
        };

        // add events to quick-search bar
        quickSearchBar.oninput = addSuggestions;
        quickSearchBar.onkeydown = searchId;
        quickSearchBar.onblur = removeSuggestionMenu;

        /**
         * click event for quickSearchBtn
         */
        var search = function () {
            var nodeName = quickSearchBar.value;
            scope.placeNodeSelectionMenu(nodeName, true);
        };
        searchBtn.onclick = search;
    };

    /**
     * Creates a node selection menu box for nodeName. If nodeName does
     * not exist, then this method will make the background color of the
     * quick search bar red.
     * This method is called both from the quick search button and when the
     * user clicks on the canvas.
     *
     * @param {String} nodeName The name of the node to make a menu box for.
     *                         Since internal nodes can have duplicate names,
     *                         it's expected that this name can be non-unique.
     * @param {Boolean} moveTree If true, then this method will center the
     *                           camera on the node in question (for example,
     *                           if the user searched for a node using the
     *                           side panel). If false, this won't be done (for
     *                           example, if the user clicked on a node, there
     *                           shouldn't be a need for the camera to move).
     * @param {Number} nodeKey Optional parameter. If specified, this should
     *                         be an index in this.empress._treeData of the
     *                         node that this menu is being shown for. This is
     *                         useful for cases where the selected node was
     *                         clicked on (so we know exactly which node it
     *                         is), but where the node in question has a
     *                         duplicate name (so we can't get its position
     *                         from just its name alone).
     */
    CanvasEvents.prototype.placeNodeSelectionMenu = function (
        nodeName,
        moveTree,
        nodeKey
    ) {
        var scope = this;
        var node;
        /**
         * This is a utility function that, given an array of node keys,
         * centers the camera on the first node (if moveTree is truthy) and
         * then passes the array to this.empress.selectedNodeMenu and opens the
         * menu / redraws the tree.
         */
        var openMenu = function (nodeKeys) {
            // We'll position the camera at whatever the "first" node in
            // nodeKeys is. This is an arbitrary decision, but better than
            // nothing.
            if (moveTree && scope.empress.focusOnSelectedNode) {
                var nodeToCenterOn = nodeKeys[0];
                scope.drawer.centerCameraOn(
                    scope.empress.getX(nodeToCenterOn),
                    scope.empress.getY(nodeToCenterOn)
                );
            }

            // show menu
            scope.selectedNodeMenu.setSelectedNodes(nodeKeys);
            scope.selectedNodeMenu.showNodeMenu();

            scope.empress.drawTree();
        };
        if (nodeKey !== undefined) {
            // If this parameter was specified, our job is easy -- we know the
            // exact node to place the menu at
            openMenu([nodeKey]);
        } else {
            // We only know the name of the node to select (due to something
            // like the user searching for this name). Therefore, if there are
            // multiple nodes with this same name, things will be ambiguous.
            var nodeKeys = this.empress._tree.getNodesWithName(nodeName);
            if (nodeKeys.length > 0) {
                // At least one node with this name exists
                openMenu(nodeKeys);
            } else {
                // No nodes have this name
                this.quickSearchBar.classList.add("invalid-search");
            }
        }
    };

    CanvasEvents.prototype.placeBarplotNodeSelectionMenu = function (
        tipKey,
        x,
        y
    ) {
        this.selectedNodeMenu.setSelectedNodes([tipKey]);
        // TODO: store customx and customy here, and use when calling
        // updatemenuposition in this class...
        this.selectedNodeMenu.showNodeMenu(x, y);
        this.empress.drawTree();
    };

    return CanvasEvents;
});
