/**
 * The main entry point.
 */
class Server {
  main(): void {
    try {
      this.startup();
    } catch (error) {
      console.error(error.message);
    }
  }

  private async startup(): Promise<void> {
    
  }
}

const server = new Server();
server.main();
