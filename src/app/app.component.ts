// src/app/app.component.ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-root',
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {}
