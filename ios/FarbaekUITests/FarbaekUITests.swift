import XCTest

/// The app opened on a simulator and toured through the sample workspace
/// (ADR 0110): each tab and a change's review. The screenshots, kept with the
/// test's results, are the App Store's iPhone screenshots.
final class FarbaekUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func snap(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testToursTheSample() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-FarbaekSample"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 30), "Today didn't open")
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 20), "The waiting changes didn't load")
        snap(app, "1-today")

        app.tabBars.buttons["Approvals"].tap()
        XCTAssertTrue(app.navigationBars["Approvals"].waitForExistence(timeout: 10))
        let change = app.staticTexts["Reject fractional quantities in the cart"].firstMatch
        XCTAssertTrue(change.waitForExistence(timeout: 20), "The sample change didn't load")
        snap(app, "2-approvals")

        change.tap()
        XCTAssertTrue(app.navigationBars["Review"].waitForExistence(timeout: 10))
        let reason = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "This is sample data")).firstMatch
        XCTAssertTrue(reason.waitForExistence(timeout: 20), "The review didn't say why it can't be approved")
        snap(app, "3-review")

        app.tabBars.buttons["Build"].tap()
        XCTAssertTrue(app.navigationBars["Build"].waitForExistence(timeout: 10))
        snap(app, "4-build")

        app.tabBars.buttons["Tasks"].tap()
        XCTAssertTrue(app.navigationBars["Tasks"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Reject fractional quantities in the cart"].waitForExistence(timeout: 20))
        snap(app, "5-tasks")

        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.navigationBars["You"].waitForExistence(timeout: 10))
        snap(app, "6-you")
    }
}
