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

        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 30), "Home didn't open")
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 20), "The waiting changes didn't load")
        snap(app, "1-home")

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

        app.tabBars.buttons["Projects"].tap()
        XCTAssertTrue(app.navigationBars["Projects"].waitForExistence(timeout: 10))
        let project = app.staticTexts["Storefront"].firstMatch
        XCTAssertTrue(project.waitForExistence(timeout: 20), "The sample projects didn't load")
        snap(app, "5-projects")

        project.tap()
        XCTAssertTrue(app.navigationBars["Project"].waitForExistence(timeout: 10))
        let task = app.staticTexts["Reject fractional quantities in the cart"].firstMatch
        XCTAssertTrue(task.waitForExistence(timeout: 20), "The project's tasks didn't load")
        snap(app, "6-project")

        task.tap()
        let next = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "The agent finished")).firstMatch
        XCTAssertTrue(next.waitForExistence(timeout: 20), "The task didn't say what to do next")
        snap(app, "7-task")

        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.navigationBars["You"].waitForExistence(timeout: 10))
        snap(app, "8-you")
    }
}
