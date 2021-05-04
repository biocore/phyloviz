define(["LayoutsUtil", "Colorer"], function (LayoutsUtil, Colorer) {
    function TreeModel(tree) {
        this.shearedTree = tree;
        this.fullTree = tree;
        this.shearedToFull = new Map();
        this.fullToSheared = new Map();

        // initialize
        for (var i = 1; i <= this.shearedTree.size; i++) {
            this.fullToSheared.set(i, i);
            this.shearedToFull.set(i, i);
        }
    }

    TreeModel.prototype.getTree = function () {
        return this.shearedTree;
    };

    TreeModel.prototype.shear = function (tips) {
        var result = this.fullTree.shear(tips);
        this.shearedTree = result.tree;
        this.shearedToFull = result.shearedToFull;
        this.fullToSheared = result.fullToSheared;
    };

    TreeModel.prototype.unshear = function () {
        this.shearedTree = this.fullTree;
        for (var i = 1; i <= this.shearedTree.size; i++) {
            this.fullToSheared.set(i, i);
            this.shearedToFull.set(i, i);
        }
    };

    TreeModel.prototype.postorderTraversal = function* (includeRoot = false) {
        var nodes = [],
            i;
        for (i = 1; i <= this.shearedToFull.size; i++) {
            nodes.push(this.shearedToFull.get(i));
        }
        if (!includeRoot) {
            nodes.pop();
        }

        yield* nodes;
    };

    /**
     * Returns all nodes in the clade whose root is node.
     *
     * Note: elements in the returned array are keys in this._treeData
     *       also, the returned array is sorted in a postorder fashion
     *
     * @param {Number} cladeRoot The root of the clade. An error is thrown if
     *                           cladeRoot is not a valid node.
     *
     * @return {Array} The nodes in the clade
     */
    TreeModel.prototype.getCladeNodes = function (cladeRoot) {
        cladeRoot = this.fullToSheared.get(cladeRoot);
        if (cladeRoot === undefined) {
            throw cladeRoot + " is not a valid node.";
        }
        // stores the clade nodes
        var cladeNodes = [];

        // Nodes in the clade are found by performing a postorder traversal
        // starting at the left most child of the clade and ending on cladeRoot

        // find left most child
        // Note: initializing lchild as cladeRoot incase cladeRoot is a tip
        var lchild = cladeRoot;
        var fchild = this.shearedTree.fchild(
            this.shearedTree.postorderselect(cladeRoot)
        );
        while (fchild !== 0) {
            lchild = this.shearedTree.postorder(fchild);
            fchild = this.shearedTree.fchild(
                this.shearedTree.postorderselect(lchild)
            );
        }

        // perform post order traversal until cladeRoot is reached.
        for (var i = lchild; i <= cladeRoot; i++) {
            cladeNodes.push(this.shearedToFull.get(i));
        }
        return cladeNodes;
    };

    function TreeController(tree) {
        /**
         *
         * @class TreeController
         *
         * Initialzes a new TreeController. This class is extends BPTree and allows
         * EMPress to dynamically shear the tree. TreeController's UI is similar to
         * BPTree. The input/output to all functions shared between TreeController
         * and BPTree are in respect to the original tree. For example,
         * postorderselect(5) will return the index of the 5th node in a postorder
         * traversal of the original tree. However, TreeController implements a new
         * function __curToOrigNodeFunction() that uses the topology of the sheared
         * tree to execute fchild, lchild, nsibling, and psibling. Thus,
         * fchild(5) will return the first child of node 5 in the sheared tree.
         * However, the input/output of fchild, lchild, nsibling, and psibling are
         * still in relation to the original tree. So, fchild(5) means the first
         * child of a node in the sheared tree that corresponds to the 5th node
         * found in a post order traversal of the original tree. In addition the
         * traversal methods such as postorderTraversal will also use the topology
         * of the sheared tree but will output the results in relation to the
         * original tree. The reason for this behavior is due to the fact that
         * empress uses a nodes postorder postion (in the orginal tree) as its key
         * in the various metadata structures.
         *
         * @param {BPTree} tree This should be the original BPTree created when
         *                      initializing empress.
         *
         * @return {TreeController}
         * @constructs TreeController
         */
        this.model = new TreeModel(tree);
        this.size = this.model.fullTree.size;
        this.currentSize = this.model.shearedTree.size;
    }

    /**
     * Returns the current (sheared) tree
     *
     * @return {BPTree}
     */
    TreeController.prototype.getTree = function () {
        return this.model.getTree();
    };

    /**
     * Removes nodes from the original tree until only the nodes found in tips
     * and there ancestors remain in the tree.
     *
     * @param{Set} tips A set of tip names that will be kept.
     */
    TreeController.prototype.shear = function (tips) {
        this.model.shear(tips);
        this.currentSize = this.model.shearedTree.size;
    };

    /**
     * Restores the original tree.
     */
    TreeController.prototype.unshear = function () {
        this.model.unshear();
        this.currentSize = this.model.shearedTree.size;
    };

    /**
     * Returns an iterator for nodes in a post order traversal of the sheared
     * tree.
     *
     * Note: This method will use the topology of the currect tree but will
     *       return the nodes position in the original tree.
     *
     * @param{Boolean} includeRoot If true then the root will be included.
     */
    TreeController.prototype.postorderTraversal = function* (
        includeRoot = false
    ) {
        yield* this.model.postorderTraversal(includeRoot);
    };

    /**
     * Returns an Object describing the minimum, maximum, and average of all
     * non-root node lengths in the sheared tree.
     *
     * @return {Object} Contains three keys: "min", "max", and "avg", mapping
     *                  to Numbers representing the minimum, maximum, and
     *                  average non-root node length in the tree.
     */
    TreeController.prototype.getLengthStats = function () {
        return this.model.shearedTree.getLengthStats();
    };

    /**
     * Return the name of the ith index in the ORIGINAL bp tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return{String}
     */
    TreeController.prototype.name = function (i) {
        return this.model.fullTree.name(i);
    };

    /**
     * Returns an array of all node names in sheared tree.
     */
    TreeController.prototype.getAllNames = function () {
        return this.model.shearedTree.getAllNames();
    };

    /**
     * Returns the number of leaf nodes in sheared tree
     *
     * @return {Number}
     */
    TreeController.prototype.numleaves = function () {
        return this.model.shearedTree.numleaves();
    };

    /**
     * Returns the length of the ith index in the ORIGINAL bp tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return{Number}
     */
    TreeController.prototype.length = function (i) {
        return this.model.fullTree.length(i);
    };

    /**
     * Return the parent index of the node that corresponds to the ith index in
     * the ORIGINAL bp tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * Note: The output of this method is also in relation to the original tree.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return{Number}
     */
    TreeController.prototype.parent = function (i) {
        return this.model.fullTree.parent(i);
    };

    /**
     * Returns the index of the opening index of the root node.
     *
     * Note: This will always be 0.
     *
     * @return {Number}
     */
    TreeController.prototype.root = function () {
        return this.model.fullTree.root();
    };

    /**
     * Returns true if i represents a leaf node
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return {Boolean}
     */
    TreeController.prototype.isleaf = function (i) {
        return this.model.fullTree.isleaf(i);
    };

    /**
     * This method is used in fchild, lchild, nsibling, and psibling and is what
     * allows TreeController to use the topology of the sheared tree but returns
     * the results w.r.t the original tree.
     *
     * @param{Number} i The index correspond to a node in the ORIGINAL tree.
     * @param{String} func The function to use. This should only be fchild,
     *                     nchild, nsibling or psibling.
     *
     * @return{Number} The result of func w.r.t the ORIGINAL tree.
     */

    TreeController.prototype._shearedToFullNodeFunction = function (i, func) {
        var shearedTreeTree = this.model.shearedTree;
        var fullTree = this.model.fullTree;

        var node = shearedTreeTree.postorderselect(
            this.model.fullToSheared.get(fullTree.postorder(i))
        );

        node = shearedTreeTree.postorder(shearedTreeTree[func](node));
        node = fullTree.postorderselect(this.model.shearedToFull.get(node));
        return node;
    };

    /**
     * Returns the opening index of first child of the node represented by i.
     * This method will use the topology of the sheared (sheared) tree but its
     * input and output will be w.r.t the ORGINAL tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return {Number} return 0 if i is a leaf node
     */
    TreeController.prototype.fchild = function (i) {
        return this._shearedToFullNodeFunction(i, "fchild");
    };

    /**
     * Returns the opening index of last child of the node represented by i.
     * This method will use the topology of the sheared (sheared) tree but its
     * input and output will be w.r.t the ORGINAL tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return {Number} return 0 if i is a leaf node
     */
    TreeController.prototype.lchild = function (i) {
        return this._shearedToFullNodeFunction(i, "lchild");
    };

    /**
     * Returns the opening index of next sibling of the node represented by i.
     * This method will use the topology of the sheared (sheared) tree but its
     * input and output will be w.r.t the ORGINAL tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return {Number} return 0 if i does not have a next sibling
     */
    TreeController.prototype.nsibling = function (i) {
        return this._shearedToFullNodeFunction(i, "nsibling");
    };

    /**
     * Returns the opening index of previous sibling of the node represented by
     * i. This method will use the topology of the sheared (sheared) tree but
     * its input and output will be w.r.t the ORGINAL tree.
     *
     * Note: The input of this method should the result of either preorderselect
     *       or postorderselect.
     *
     * @param{Number} i The index corresponding to a node in the ORIGINAL tree
     *
     * @return {Number} return 0 if i does not have a previous sibling
     */
    TreeController.prototype.psibling = function (i) {
        return this._shearedToFullNodeFunction(i, "psibling");
    };

    /**
     * Returns the postorder rank of index i in the ORIGINAL tree.
     *
     * Note: The input of this method should the result of parent, fchild,
     *       lchild, nsibling or psibling.
     *
     * @param {Number} i The index to assess postorder rank
     *
     * @return {Number} The postorder rank of index i
     */
    TreeController.prototype.postorder = function (i) {
        return this.model.fullTree.postorder(i);
    };

    /**
     * Find the index of the node with postorder k in the ORIGINAL tree.
     *
     * @param {Number} k The postorder to search for
     *                 Note: k starts at 1
     *
     * @return {Number} The index position of the node in the tree
     */
    TreeController.prototype.postorderselect = function (k) {
        return this.model.fullTree.postorderselect(k);
    };

    /**
     * Returns the preorder rank of index i in the ORIGINAL tree.
     *
     * Note: The input of this method should the result of parent, fchild,
     *       lchild, nsibling or psibling.
     *
     * @param {Number} i The index to assess preorder rank
     *
     * @return {Number} The preorder rank of index i
     */
    TreeController.prototype.preorder = function (i) {
        return this.model.fullTree.preorder(i);
    };

    /**
     * Find the index of the node with preorder k in the ORIGINAL tree.
     *
     * @param {Number} k The preorder to search for.
     *                 Note: k starts at 1.
     *
     * @return {Number} The index position of the node in the tree
     */
    TreeController.prototype.preorderselect = function (k) {
        return this.model.fullTree.preorderselect(k);
    };

    /**
     * Returns an iterator for nodes in an in-order traversal of the sheared
     * tree.
     *
     * Note: This method will use the topology of the currect tree but will
     *       return the nodes position in the original tree.
     *
     * @param{Boolean} includeRoot If true then the root will be included.
     */
    TreeController.prototype.inOrderTraversal = function* (
        includeRoot = false
    ) {
        var inOrderNodes = this.model.shearedTree.inOrderNodes();
        for (var i = 0; i < inOrderNodes.length; i++) {
            inOrderNodes[i] = this.model.shearedToFull.get(inOrderNodes[i]);
        }
        if (!includeRoot) {
            inOrderNodes.shift();
        }
        yield* inOrderNodes;
    };

    /**
     * Finds the sum of lengths from start to end. This method will use the
     * topology of the sheared tree but its input must be w.r.t the ORIGINAL
     * tree.
     *
     * Note: start must be a descendant of end. An error will be thrown if start
     *       is not a descendant of end. Also, this method does not take into
     *       account the length of end since that length would represent the
     *       length of end to its parent.
     *
     * @param {Number} start The postorder position of a node
     * @param {Number} end The postorder position of a node
     * @param {Boolean} ignoreLengths If truthy, treat all node lengths as 1;
     *                                if falsy, actually consider node lengths
     *
     * @return {Number} the sum of length from start to end
     */
    TreeController.prototype.getTotalLength = function (
        start,
        end,
        ignoreLengths
    ) {
        start = this.model.fullToSheared.get(start);
        end = this.model.fullToSheared.get(end);
        return this.model.shearedTree.getTotalLength(start, end, ignoreLengths);
    };

    /**
     * Retrieve the tips in the subtree of a given (internal) node key. This
     * method will use the topology of the sheared tree but its input/output
     * will be w.r.t the ORIGINAL tree.
     *
     * @param {Number} nodeKey The post-order position of a node in the ORIGINAL
     *                 tree
     *
     * @return {Array} tips Tips of the subtree.
     */
    TreeController.prototype.findTips = function (nodeKey) {
        nodeKey = this.model.fullToSheared.get(nodeKey);
        var tips = this.model.shearedTree.findTips(nodeKey);
        for (var i = 0; i < tips.length; i++) {
            tips[i] = this.model.shearedToFull.get(tips[i]);
        }
        return tips;
    };

    /**
     * Retrieve number of tips in the subtree of a given node. This method will
     * use the topology of the sheared tree but its input must be w.r.t the
     * ORIGINAL tree.
     *
     * @param {Integer} nodeKey The postorder position of a node in the ORIGINAL
     *                  tree
     *
     * @return {Integer} The number of tips on the subtree rooted at nodeKey.
     */
    TreeController.prototype.getNumTips = function (nodeKey) {
        nodeKey = this.model.fullToSheared.get(nodeKey);
        return this.model.shearedTree.getNumTips(nodeKey);
    };

    /**
     * Checks to see if name is in the sheared tree.
     *
     * @param {String} name The name to search for.
     *
     * @return {Boolean} If the name is in the tree.
     */
    TreeController.prototype.containsNode = function (name) {
        return this.model.shearedTree.containsNode(name);
    };

    /**
     * Returns all nodes with a given name. This method will use the topology
     * of the sheared tree but its output will be w.r.t the ORIGINAL tree.
     *
     * @param {String} name The name of the node(s)
     *
     * @return {Array} An array of postorder positions of nodes with a given
     *                 name. If no nodes have the specified name, this will be
     *                 an empty array.
     */
    TreeController.prototype.getNodesWithName = function (name) {
        var nodes = this.model.shearedTree.getNodesWithName(name);
        for (var i = 0; i < nodes.length; i++) {
            nodes[i] = this.model.shearedToFull.get(nodes[i]);
        }
        return nodes;
    };

    /**
     * Returns all nodes in the clade whose root is node.
     *
     * Note: elements in the returned array are keys in this._treeData
     *       also, the returned array is sorted in a postorder fashion
     *
     * @param {Number} cladeRoot The root of the clade. An error is thrown if
     *                           cladeRoot is not a valid node.
     *
     * @return {Array} The nodes in the clade
     */
    TreeController.prototype.getCladeNodes = function (cladeRoot) {
        return this.model.getCladeNodes(cladeRoot);
    };

    return TreeController;
});
