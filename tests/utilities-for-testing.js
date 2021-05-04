define(["Empress", "BPTree", "BiomTable"], function (
    Empress,
    BPTree,
    BiomTable
) {
    /**
     * Returns an Object containing test data that can be used to construct an
     * instance of Empress.
     *
     * This function was cobbled together from the setup code in
     * test-empress.js. It will likely need to be extended or modified to
     * support further testing in the future.
     *
     * @param {Boolean} constructEmpress If truthy, this will actually create a
     *                                   new Empress instance and include this
     *                                   instance in the returned Object under
     *                                   the key "empress". If this is falsy,
     *                                   this will instead just set the value
     *                                   of the empress key to null.
     * @return {Object} testData
     */
    function getTestData(constructEmpress = false) {
        // tree comes from the following newick string
        // ((1,(2,3)4)5,6)7;
        var tree = new BPTree(
            [1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0],
            // see https://github.com/biocore/empress/issues/311
            ["", "1", "2", "3", "internal", "internal", null, "root"],
            [0, 1, 2, 3, 4, 5, 6, 7],
            null
        );

        // Note: the coordinates for each layout are "random". i.e.
        // they will not make an actual tree. They were created to
        // make testing easier.

        // see core.py for more details on  the format of treeData
        var treeData = [
            0, // this is blank since empress uses 1-based index. This
            // will be addressed with #223
            [3289650, false, true, 29, 30, 1, 2, 15, 16, 0, 0, 0],
            [3289650, false, true, 31, 32, 3, 4, 17, 18, 0, 0, 0.5],
            [3289650, false, true, 33, 34, 5, 6, 19, 20, 0, 0, 1],
            [3289650, false, true, 35, 36, 7, 8, 21, 22, 0, 0, 0],
            [3289650, false, true, 37, 38, 9, 10, 23, 24, 0, 0, 0],
            [3289650, false, true, 39, 40, 11, 12, 25, 26, 0, 0, 0],
            [3289650, false, true, 41, 42, 13, 14, 27, 28, 0, 0, 0],
        ];
        var tdToInd = {
            // all nodes
            color: 0,
            isColored: 1,
            visible: 2,
            x2: 3,
            y2: 4,
            xr: 5,
            yr: 6,
            xc1: 7,
            yc1: 8,
            xc0: 9,
            yc0: 10,
            angle: 11,
            // all internal nodes
            highestchildyr: 12,
            lowestchildyr: 13,
            // non-root internal nodes
            arcx0: 14,
            arcy0: 15,
            arcstartangle: 16,
            arcendangle: 17,
        };

        // data for the BiomTable object
        // (These IDs / indices aren't assigned in any particular
        // order; as long as it's consistent it doesn't matter.
        // However, setting fIDs in this way is convenient b/c it means
        // the index of feature "1" is 1, of "2" is 2, etc.)
        var sIDs = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
        var fIDs = [6, 1, 2, 3];
        var sID2Idx = {
            s1: 0,
            s2: 1,
            s3: 2,
            s4: 3,
            s5: 4,
            s6: 5,
            s7: 6,
        };
        var fID2Idx = {
            6: 0,
            1: 1,
            2: 2,
            3: 3,
        };
        // See test-biom-table.js for details on this format. Briefly,
        // each inner array describes the feature indices present in a
        // sample.
        var tbl = [
            [1, 2, 3],
            [2, 3],
            [0, 1, 3],
            [2],
            [0, 1, 2, 3],
            [1, 2, 3],
            [0],
        ];
        var smCols = ["f1", "grad", "traj"];
        var sm = [
            ["a", "1", "t1"],
            ["a", "2", "t1"],
            ["a", "1", "t2"],
            ["b", "2", "t2"],
            ["a", "3", "t3"],
            ["a", "3", "t3"],
            ["b", "4", "t4"],
        ];
        var featureColumns = ["f1", "f2"];
        var splitTaxColumns = [];
        var tipMetadata = {
            1: ["2", "2"],
            2: ["1", "2"],
            3: ["1", "2"],
            6: ["2", "2"],
        };
        var intMetadata = {
            4: ["1", "1"],
            5: ["1", "1"],
        };
        var biom = new BiomTable(sIDs, fIDs, sID2Idx, fID2Idx, tbl, smCols, sm);
        var canvas = document.createElement("canvas");

        // Rectangular layout y scaling factor
        // equal to 4020 / (# leaves - 1) = 4020 / 3 = 1,340.0
        var yrscf = 1340.0;
        var empress;
        if (constructEmpress) {
            empress = new Empress(
                tree,
                biom,
                featureColumns,
                splitTaxColumns,
                tipMetadata,
                intMetadata,
                canvas
            );
            // Set leafSorting to none -- this is no longer the default, but it
            // previously was. (This avoids all of the rect / circular layout
            // JS tests being broken...)
            empress.leafSorting = "none";
        } else {
            empress = null;
        }

        return {
            empress: empress,
            tree: tree,
            treeData: treeData,
            tdToInd: tdToInd,
            biom: biom,
            fmCols: featureColumns,
            splitTaxCols: splitTaxColumns,
            tm: tipMetadata,
            im: intMetadata,
            canvas: canvas,
        };
    }

    /**
     * Returns an Empress object created from the test data returned by
     * getTestData(), with the key distinction that all feature metadata
     * columns are "declared" as split taxonomy columns.
     *
     * Abstracting this is surprisingly useful for testing this functionality
     * in many different ways -- it lets us avoid re-typing a lot of stuff.
     *
     * @return {Empress} testEmpress
     */
    function getEmpressForAncestorTaxProp() {
        // Need to create a new Empress object, since the default test one has no
        // split taxonomy columns "declared" on initialization
        var testData = getTestData();
        return new Empress(
            testData.tree,
            null,
            testData.fmCols,
            // Let's say that f1 and f2 are both split taxonomy columns -- our
            // declaration of them in this order means that f1 is the highest
            // level and f2 is the lowest level
            testData.fmCols,
            testData.tm,
            testData.im,
            testData.canvas
        );
    }

    /**
     * Returns an Object containing test data that can be used to construct an
     * instance of Empress.
     *
     * This function was cobbled together from the setup code in
     * test-empress.js. It will likely need to be extended or modified to
     * support further testing in the future.
     *
     * @return {Object} testData
     */
    function getTestDataSingleDescendant() {
        // tree comes from the following newick string
        // ((1)s)7;
        var tree = new BPTree(
            new Uint8Array([1, 1, 1, 0, 0, 0]),
            // see https://github.com/biocore/empress/issues/311
            ["", "1", "s", "root"],
            [0, 1, 2, 3],
            null
        );

        var empress = new Empress(tree, null, [], [], [], [], null);

        // see core.py for more details on  the format of treeData
        var treeData = [
            0, // this is blank since empress uses 1-based index. This
            // will be addressed with #223
            [3289650, false, true, 1, 2, 1, 2],
            [3289650, false, true, 3, 4, 3, 4],
            [3289650, false, true, 5, 6, 5, 6],
        ];
        empress._treeData = treeData;
        return {
            empress: empress,
        };
    }

    /**
     * Returns reference SVGs for the unique values [0, 1, 2, 3, 4] and the
     * color map "Viridis".
     *
     * Note that EMPress splits up the gradient SVG into two separate
     * attributes of the Colorer object: _gradientSVG and _pageSVG.
     * The gradient SVG contains the <defs> and <linearGradient> that define
     * the gradient, and the the page SVG contains the <rect> and <text>s that
     * position the gradient in a HTML element within the application and
     * place min / mid / max value text along it.
     *
     * The reason for this split is to make exporting continuous legends
     * easier, since if we want to alter the height of the gradient we'll need
     * to replace the page SVG with custom code.
     *
     * Here, we return both SVGs -- gradient and page -- as separate strings
     * in an Array.
     *
     * This data was (at least initially) taken directly from Emperor's tests:
     * https://github.com/biocore/emperor/blob/00c73f80c9d504826e61ddcc8b2c0b93f344819f/tests/javascript_tests/test_color_view_controller.js#L212
     *
     * Main differences between this SVG and Emperor's (beside the whole being
     * split into two strings thing) are that:
     *  1. the ID "Gradient" was replaced with "Gradient0", 0 being the
     *     default gradientIDSuffix value in the Colorer constructor.
     *  2. the <rect> ID has been omitted, since it wasn't used anywhere
     *     as far as I can tell.
     *  3. Newlines have been inserted in a few places throughout the SVG,
     *     to make reading it slightly more pleasant.
     *
     * @return {Array} [gradientSVG, pageSVG]
     */
    function getReferenceSVGs() {
        return [
            '<defs><linearGradient id="Gradient0" x1="0" x2="0" y1="1" y2="0">' +
                '<stop offset="0%" stop-color="#440154"/>' +
                '<stop offset="1%" stop-color="#440457"/>' +
                '<stop offset="2%" stop-color="#45075a"/>' +
                '<stop offset="3%" stop-color="#450a5c"/>' +
                '<stop offset="4%" stop-color="#450d5f"/>' +
                '<stop offset="5%" stop-color="#461062"/>' +
                '<stop offset="6%" stop-color="#461365"/>' +
                '<stop offset="7%" stop-color="#461668"/>' +
                '<stop offset="8%" stop-color="#47196a"/>' +
                '<stop offset="9%" stop-color="#471c6d"/>' +
                '<stop offset="10%" stop-color="#471f70"/>' +
                '<stop offset="11%" stop-color="#482273"/>' +
                '<stop offset="12%" stop-color="#482576"/>' +
                '<stop offset="13%" stop-color="#482878"/>' +
                '<stop offset="14%" stop-color="#472b79"/>' +
                '<stop offset="15%" stop-color="#462e7b"/>' +
                '<stop offset="16%" stop-color="#45317c"/>' +
                '<stop offset="17%" stop-color="#45347e"/>' +
                '<stop offset="18%" stop-color="#44367f"/>' +
                '<stop offset="19%" stop-color="#433981"/>' +
                '<stop offset="20%" stop-color="#433c82"/>' +
                '<stop offset="21%" stop-color="#423f84"/>' +
                '<stop offset="22%" stop-color="#414285"/>' +
                '<stop offset="23%" stop-color="#404487"/>' +
                '<stop offset="24%" stop-color="#404788"/>' +
                '<stop offset="25%" stop-color="#3f4a8a"/>' +
                '<stop offset="26%" stop-color="#3e4c8a"/>' +
                '<stop offset="27%" stop-color="#3d4f8b"/>' +
                '<stop offset="28%" stop-color="#3c518b"/>' +
                '<stop offset="29%" stop-color="#3b538b"/>' +
                '<stop offset="30%" stop-color="#39568c"/>' +
                '<stop offset="31%" stop-color="#38588c"/>' +
                '<stop offset="32%" stop-color="#375a8c"/>' +
                '<stop offset="33%" stop-color="#365d8d"/>' +
                '<stop offset="34%" stop-color="#355f8d"/>' +
                '<stop offset="35%" stop-color="#34618d"/>' +
                '<stop offset="36%" stop-color="#33648e"/>' +
                '<stop offset="37%" stop-color="#32668e"/>' +
                '<stop offset="38%" stop-color="#31688e"/>' +
                '<stop offset="39%" stop-color="#306a8e"/>' +
                '<stop offset="40%" stop-color="#2f6d8e"/>' +
                '<stop offset="41%" stop-color="#2e6f8e"/>' +
                '<stop offset="42%" stop-color="#2d718e"/>' +
                '<stop offset="43%" stop-color="#2c738e"/>' +
                '<stop offset="44%" stop-color="#2b768f"/>' +
                '<stop offset="45%" stop-color="#2a788f"/>' +
                '<stop offset="46%" stop-color="#2a7a8f"/>' +
                '<stop offset="47%" stop-color="#297c8f"/>' +
                '<stop offset="48%" stop-color="#287f8f"/>' +
                '<stop offset="49%" stop-color="#27818f"/>' +
                '<stop offset="50%" stop-color="#26838f"/>' +
                '<stop offset="51%" stop-color="#25858f"/>' +
                '<stop offset="52%" stop-color="#25878e"/>' +
                '<stop offset="53%" stop-color="#24898e"/>' +
                '<stop offset="54%" stop-color="#248b8d"/>' +
                '<stop offset="55%" stop-color="#238d8d"/>' +
                '<stop offset="56%" stop-color="#238f8d"/>' +
                '<stop offset="57%" stop-color="#22928c"/>' +
                '<stop offset="58%" stop-color="#22948c"/>' +
                '<stop offset="59%" stop-color="#21968b"/>' +
                '<stop offset="60%" stop-color="#20988b"/>' +
                '<stop offset="61%" stop-color="#209a8b"/>' +
                '<stop offset="62%" stop-color="#1f9c8a"/>' +
                '<stop offset="63%" stop-color="#229f88"/>' +
                '<stop offset="64%" stop-color="#28a384"/>' +
                '<stop offset="65%" stop-color="#2ea780"/>' +
                '<stop offset="66%" stop-color="#35ab7d"/>' +
                '<stop offset="67%" stop-color="#3baf79"/>' +
                '<stop offset="68%" stop-color="#41b375"/>' +
                '<stop offset="69%" stop-color="#47b671"/>' +
                '<stop offset="70%" stop-color="#4dba6d"/>' +
                '<stop offset="71%" stop-color="#53be69"/>' +
                '<stop offset="72%" stop-color="#5ac266"/>' +
                '<stop offset="73%" stop-color="#60c662"/>' +
                '<stop offset="74%" stop-color="#66ca5e"/>' +
                '<stop offset="75%" stop-color="#6cce5a"/>' +
                '<stop offset="76%" stop-color="#72cf56"/>' +
                '<stop offset="77%" stop-color="#78d152"/>' +
                '<stop offset="78%" stop-color="#7ed24f"/>' +
                '<stop offset="79%" stop-color="#84d34b"/>' +
                '<stop offset="80%" stop-color="#8ad447"/>' +
                '<stop offset="81%" stop-color="#90d643"/>' +
                '<stop offset="82%" stop-color="#95d740"/>' +
                '<stop offset="83%" stop-color="#9bd83c"/>' +
                '<stop offset="84%" stop-color="#a1da38"/>' +
                '<stop offset="85%" stop-color="#a7db34"/>' +
                '<stop offset="86%" stop-color="#addc31"/>' +
                '<stop offset="87%" stop-color="#b3dd2d"/>' +
                '<stop offset="88%" stop-color="#b9de2b"/>' +
                '<stop offset="89%" stop-color="#bfdf2a"/>' +
                '<stop offset="90%" stop-color="#c4e02a"/>' +
                '<stop offset="91%" stop-color="#cae129"/>' +
                '<stop offset="92%" stop-color="#d0e229"/>' +
                '<stop offset="93%" stop-color="#d6e228"/>' +
                '<stop offset="94%" stop-color="#dbe328"/>' +
                '<stop offset="95%" stop-color="#e1e427"/>' +
                '<stop offset="96%" stop-color="#e7e527"/>' +
                '<stop offset="97%" stop-color="#ede626"/>' +
                '<stop offset="98%" stop-color="#f2e626"/>' +
                '<stop offset="99%" stop-color="#f8e725"/>' +
                '<stop offset="100%" stop-color="#fee825"/>' +
                "</linearGradient></defs>\n",

            '<rect width="20" height="95%" fill="url(#Gradient0)"/>\n' +
                '<text x="25" y="12px" font-family="sans-serif" ' +
                'font-size="12px" text-anchor="start">4</text>\n' +
                '<text x="25" y="50%" font-family="sans-serif" ' +
                'font-size="12px" text-anchor="start">2</text>\n' +
                '<text x="25" y="95%" font-family="sans-serif" ' +
                'font-size="12px" text-anchor="start">0</text>\n',
        ];
    }

    /**
     * Checks that |n2 - n1| is less than epsilon.
     *
     * @param {Number} n1
     * @param {Number} n2
     * @param {String} message
     * @param {Number} epsilon In order for this test to not fail, the
     *                         absolute difference between n1 and n2 must be
     *                         less than this value. Defaults to 1e-5.
     */
    function approxDeepEqual(n1, n2, message, epsilon = 1e-5) {
        var diff = Math.abs(n2 - n1);
        // For debugging: uncomment to log what the difference was
        // if (diff >= epsilon) {
        //     console.log(diff, epsilon, message);
        // }
        ok(diff < epsilon, message);
    }

    /**
     * Given two arrays of numbers, checks that the arrays are of equal length
     * and that (for every position i in the arrays) the i-th number within
     * both arrays are approximately equal.
     *
     * @param {Array} arr1
     * @param {Array} arr2
     * @param {String} message
     * @param {Number} epsilon In order for this test to not fail, the
     *                         absolute difference between the i-th element in
     *                         arr1 and the i-th element in arr2 must be less
     *                         than this value. Defaults to 1e-5.
     */
    function approxDeepEqualMulti(arr1, arr2, message, epsilon = 1e-5) {
        deepEqual(
            arr1.length,
            arr2.length,
            message + ": array lengths match up"
        );
        for (var i = 0; i < arr1.length; i++) {
            approxDeepEqual(arr1[i], arr2[i], message, epsilon);
        }
    }

    return {
        getTestData: getTestData,
        getEmpressForAncestorTaxProp: getEmpressForAncestorTaxProp,
        approxDeepEqual: approxDeepEqual,
        approxDeepEqualMulti: approxDeepEqualMulti,
        getReferenceSVGs: getReferenceSVGs,
        getTestDataSingleDescendant: getTestDataSingleDescendant,
    };
});
