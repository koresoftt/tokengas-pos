// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  constructor(private router: Router) {}

  async ngOnInit() {
    // Deja que LoadingPage haga el flujo (device-login, status, redirects)
    await this.router.navigateByUrl('/loading', { replaceUrl: true });
  }
}
